import { getSession, saveSession } from "../services/session.service.js";
import { selectModel } from "../services/modelRouter.js";
import { executeTool } from "./toolExecutor.js";
import { TOOLS } from "./tools.js";
import { saveChatHistory } from "../services/chatHistory.service.js";
import { updateAgentMemory } from "./memoryManager.js";
import groq from "../config/groq.js";
import { logger } from "../config/logger.js";
import { MODELS } from "../config/models.js";
import Person from "../models/Person.js";
import { env } from "../config/env.js";
import { circuitBreaker, recordFailureMetric, updateResponseTime } from "../services/aiHealth.service.js";

const MAX_TOOL_DEPTH = 5;
const MAX_MESSAGES = 20;
const DEFAULT_TEMPERATURE = 0;

/**
 * Run the central Agent Loop to orchestrate the interaction between
 * the LLM (Groq), tool executor, and Redis session memory.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.message
 * @returns {Promise<object>} { reply, model, toolCalls, iterations, stoppedBecause }
 */
export async function runAgent({ userId, message }) {
  if (!userId) {
    throw new Error("userId is required");
  }
  if (typeof message !== "string") {
    throw new Error("message must be a string");
  }

  logger.info({ userId, message }, "Starting runAgent execution");

  // 1. Load session from Redis (fetches current or defaults)
  const session = await getSession(userId);

  // Clean and truncate history immediately upon loading to purge any existing oversized messages/URLs
  session.messages = cleanHistoryForStorage(session.messages);
  if (session.messages.length >= MAX_MESSAGES) {
    session.messages = session.messages.slice(-(MAX_MESSAGES - 1));
  }

  // 2. Append the user message to local memory
  const userMsg = { role: "user", content: message };
  session.messages.push(userMsg);

  // 3. Select model using deterministic heuristic
  let model = selectModel(message);

  let depth = 0;
  const executedToolCalls = [];
  let stoppedBecause = null;
  let finalReply = "";

  // Work with a local reference to session messages
  const messages = session.messages;

  // Pre-filter tools based on query context to keep prompt size optimized
  const activeTools = getRelevantTools(message, messages);

  // Fetch user's labeled people names to guide the LLM mapping
  let peopleList = "";
  if (process.env.APES_TEST_MODE === "true") {
    peopleList = "Dad, Mom, John";
  } else {
    const people = await Person.find({ userId }).select("name").lean();
    peopleList = people.map(p => p.name).join(", ");
  }

  // SYSTEM INSTRUCTIONS: Guide the LLM to follow tool invocation boundaries and prevent infinite loops.
  const systemPrompt = {
    role: "system",
    content: `You are APES AI, a helpful photo assistant. Today is ${new Date().toISOString().split('T')[0]}.
Labeled people in user collection: ${peopleList || 'none'}.
Rules:
1. Only call tools when explicitly required by the user's request.
2. For search queries, call 'searchPhotos'. Do NOT call delivery/zip tools unless explicitly asked to send/share.
3. If asked to email or WhatsApp photos, call the corresponding tool.
4. Resolve relative dates/time periods (e.g. 'last week', 'yesterday', 'January') to absolute ISO dates, but DO NOT provide fromDate or toDate unless a date/time reference was explicitly requested by the user.
5. Match names in queries (like 'Jan') to labeled people.
6. If the user explicitly asks to compress the photos, send a ZIP, or send as a ZIP archive, pass the format parameter as 'zip' when calling sendEmail or sendWhatsApp.
7. Do not fill 'fromDate' or 'toDate' parameters in 'searchPhotos' unless the user's request explicitly specifies a date, time period, or relative date expression. If no time constraints are specified, omit these parameters entirely. Under no circumstances should you default empty or unspecified date ranges to today's date.`
  };


  // 4. Run orchestration loop
  while (depth < MAX_TOOL_DEPTH) {
    depth++;
    logger.info({ depth, model }, "Executing agent loop iteration");

    // Prep messages for Groq by prepending the system instructions dynamically to a compact context window
    const activeMessages = messages.slice(-10); // Keep only the last 10 messages for prompt compacting
    const groqMessages = [systemPrompt, ...activeMessages];

    // Estimate prompt token count before LLM call
    const estimatedTokens = estimateTokenCount(groqMessages, activeTools);
    logger.info({ estimatedTokens }, "Estimated prompt token count before Groq LLM call");

    let response;
    let activeModel = model;
    let rateLimitedModels = new Set();

    while (true) {
      // Audit and log the exact request payload sent to Groq
      logger.info({
        groqPayload: {
          model: activeModel,
          messages: groqMessages,
          tools: activeTools,
          tool_choice: "auto"
        }
      }, "Sending request payload to Groq");

      try {
        response = await callGroqWithRetryAndTimeout({
          model: activeModel,
          messages: groqMessages,
          tools: activeTools,
          tool_choice: "auto",
          temperature: DEFAULT_TEMPERATURE
        });
        model = activeModel; // Update successfully used model
        break; // Success!
      } catch (err) {
        const isRateLimit = err.status === 429 || 
                            err.type === "RateLimitError" || 
                            err.name === "RateLimitError" || 
                            err.message?.includes("429") || 
                            err.message?.includes("rate_limit");

        if (isRateLimit) {
          rateLimitedModels.add(activeModel);
          logger.warn({ model: activeModel, error: err.message }, "Groq model hit rate limit.");
          
          // Determine fallback model
          const fallback = activeModel === MODELS.REASONING ? MODELS.FAST : MODELS.REASONING;
          if (rateLimitedModels.has(fallback)) {
            logger.error("All available models are rate-limited. Failing.");
            throw err;
          }
          
          logger.info({ fallback }, "Retrying with fallback model...");
          activeModel = fallback;
          continue; // Try again with fallback
        }

        const isToolUseError = err.status === 400 || 
                              err.message.includes("tool_use_failed") || 
                              err.message.includes("Failed to call a function");

        if (isToolUseError) {
          if (activeModel === MODELS.FAST && !rateLimitedModels.has(MODELS.REASONING)) {
            logger.warn({ err: err.message }, "Fast model tool execution failed due to Groq parser bug. Retrying with Reasoning model...");
            try {
              response = await callGroqWithRetryAndTimeout({
                model: MODELS.REASONING,
                messages: groqMessages,
                tools: activeTools,
                tool_choice: "auto",
                temperature: DEFAULT_TEMPERATURE
              });
              model = MODELS.REASONING;
              break; // Success!
            } catch (retryErr) {
              const isRetryRateLimit = retryErr.status === 429 || 
                                       retryErr.type === "RateLimitError" || 
                                       retryErr.name === "RateLimitError" || 
                                       retryErr.message?.includes("429") || 
                                       retryErr.message?.includes("rate_limit");
              if (isRetryRateLimit) {
                rateLimitedModels.add(MODELS.REASONING);
              }

              const failedGen = retryErr.error?.failed_generation || retryErr.failed_generation || retryErr.message;
              const parsedCall = parseFailedGeneration(failedGen);
              if (parsedCall) {
                logger.info({ parsedCall }, "Reasoning model failed tool use. Recovered successfully via manual parsing of failed_generation");
                response = {
                  choices: [
                    {
                      message: {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                          {
                            id: "call_" + Math.random().toString(36).substring(2),
                            type: "function",
                            function: {
                              name: parsedCall.name,
                              arguments: JSON.stringify(parsedCall.args)
                            }
                          }
                        ]
                      }
                    }
                  ]
                };
                model = MODELS.REASONING;
                break; // Recovered!
              } else {
                throw retryErr;
              }
            }
          } else {
            // Already on REASONING model, or FAST failed and REASONING is rate-limited
            const failedGen = err.error?.failed_generation || err.failed_generation || err.message;
            const parsedCall = parseFailedGeneration(failedGen);
            if (parsedCall) {
              logger.info({ parsedCall }, "Reasoning model failed tool use on first attempt. Recovered successfully via manual parsing of failed_generation");
              response = {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "call_" + Math.random().toString(36).substring(2),
                          type: "function",
                          function: {
                            name: parsedCall.name,
                            arguments: JSON.stringify(parsedCall.args)
                          }
                        }
                      ]
                    }
                  }
                ]
              };
              model = MODELS.REASONING;
              break; // Recovered!
            } else {
              throw err;
            }
          }
        } else {
          throw err;
        }
      }
    }

    const responseMessage = response.choices[0].message;

    // Check if Groq decided to request tool calls
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Append assistant's tool call message
      const assistantMsg = {
        role: "assistant",
        content: responseMessage.content || null,
        tool_calls: responseMessage.tool_calls
      };
      messages.push(assistantMsg);

      // Execute each tool call
      for (const toolCall of responseMessage.tool_calls) {
        const name = toolCall.function.name;
        let args = {};
        
        // Parse arguments safely
        try {
          if (toolCall.function.arguments) {
            args = typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
          }
        } catch (err) {
          logger.error({ err: err.message, rawArgs: toolCall.function.arguments }, "Failed to parse tool call arguments");
        }

        logger.info({ toolName: name, args }, "Executing tool call");
        
        let result;
        try {
          // Retrieve the most recent session from Redis to ensure references are resolved correctly
          const currentSession = await getSession(userId);
          result = await executeTool(name, args, userId, currentSession);
          
          // Update agent's short-term memory key in Redis
          await updateAgentMemory({
            userId,
            toolName: name,
            toolArgs: args,
            toolResult: result
          });
        } catch (err) {
          logger.error({ err: err.message, toolName: name }, "Tool execution or memory update failed");
          result = { error: err.message };
        }

        executedToolCalls.push({
          name,
          args,
          result
        });

        // Minimize tool execution result for history context to save prompt tokens
        const minimizedResult = getMinimizedToolResult(name, result);

        // Append tool result message
        const toolMsg = {
          role: "tool",
          tool_call_id: toolCall.id,
          name,
          content: JSON.stringify(minimizedResult)
        };
        messages.push(toolMsg);
      }
    } else {
      // No tool calls: final response produced
      finalReply = responseMessage.content || "";
      const assistantReplyMsg = {
        role: "assistant",
        content: finalReply
      };
      messages.push(assistantReplyMsg);
      break;
    }
  }

  // 5. Handle Max Depth condition
  if (depth === MAX_TOOL_DEPTH && !finalReply) {
    logger.warn({ userId, depth }, "Maximum tool depth reached without final reply");
    finalReply = "The request could not be completed safely.";
    stoppedBecause = "MAX_DEPTH";
    
    // Add safety fallback response to conversation
    messages.push({
      role: "assistant",
      content: finalReply
    });
  }

  // 6. Reload session from Redis to get the memory updates, then append messages and save
  const latestSession = await getSession(userId);
  latestSession.messages = cleanHistoryForStorage(messages);

  if (latestSession.messages.length > MAX_MESSAGES) {
    latestSession.messages = latestSession.messages.slice(-MAX_MESSAGES);
  }

  // 7. Save updated session back to Redis (one single write)
  await saveSession(userId, latestSession);

  // 8. Save completed chat interaction to database (non-blocking for user response experience)
  try {
    await saveChatHistory({
      userId,
      userMessage: message,
      assistantReply: finalReply
    });
  } catch (err) {
    logger.error({ err, userId }, "Failed to save chat history to database");
  }

  return {
    reply: finalReply,
    model,
    toolCalls: executedToolCalls,
    iterations: depth,
    ...(stoppedBecause ? { stoppedBecause } : {})
  };
}

/**
 * Truncate/clean up large messages in history to prevent rate limit (TPM) issues.
 * Strips the 'url' field from searchPhotos tool results as the LLM does not need it for reasoning.
 */
function cleanHistoryForStorage(messages) {
  return messages.map(msg => {
    if (msg.role === "tool" && msg.name === "searchPhotos") {
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed)) {
          const summarized = parsed.map(photo => ({
            id: photo.id,
            date: photo.date,
            people: photo.people
          }));
          return {
            ...msg,
            content: JSON.stringify(summarized)
          };
        }
      } catch (err) {
        // Fallback to original message if parsing fails
      }
    }
    return msg;
  });
}

/**
 * Filter available tools based on message query and conversation history to save token count.
 */
function getRelevantTools(message, history = []) {
  const historyText = history.map(m => m.content || "").join(" ");
  const normalizedText = (message + " " + historyText).toLowerCase();

  const tools = [];

  const searchPhotosTool = TOOLS.find(t => t.function.name === "searchPhotos");
  if (searchPhotosTool) {
    tools.push(searchPhotosTool);
  }

  const hasPeopleKeywords = ["people", "person", "who", "names", "list", "label", "contacts"].some(kw => normalizedText.includes(kw));
  if (hasPeopleKeywords) {
    const getPeopleTool = TOOLS.find(t => t.function.name === "getPeople");
    if (getPeopleTool) {
      tools.push(getPeopleTool);
    }
  }

  const hasDeliveryKeywords = ["email", "mail", "gmail", "send", "whatsapp", "phone", "number", "share", "deliver", "zip", "confirm", "yes", "no", "ok", "sure", "cancel"].some(kw => normalizedText.includes(kw));
  if (hasDeliveryKeywords) {
    const deliveryTools = TOOLS.filter(t => 
      ["sendEmail", "sendWhatsApp", "requestZipConfirmation", "confirmZipDelivery"].includes(t.function.name)
    );
    tools.push(...deliveryTools);
  }

  const hasHistoryKeywords = ["history", "sent", "share history", "delivery history", "past", "previous shares"].some(kw => normalizedText.includes(kw));
  if (hasHistoryKeywords) {
    const historyTool = TOOLS.find(t => t.function.name === "getDeliveryHistory");
    if (historyTool) {
      tools.push(historyTool);
    }
  }

  return tools;
}

/**
 * Minimize tool execution result structure to optimize LLM prompt token size.
 */
function getMinimizedToolResult(name, result) {
  if (name === "searchPhotos" && Array.isArray(result)) {
    return result.map(photo => ({
      id: photo.id,
      date: photo.date,
      people: photo.people
    }));
  }
  return result;
}

/**
 * Estimate the token count of a given messages array and tools list.
 */
function estimateTokenCount(messages, tools) {
  let text = "";
  for (const msg of messages) {
    text += msg.role || "";
    text += msg.content || "";
    if (msg.tool_calls) {
      text += JSON.stringify(msg.tool_calls);
    }
  }
  if (tools) {
    text += JSON.stringify(tools);
  }
  return Math.ceil(text.length / 4);
}

/**
 * Robust fallback parser for Groq's failed_generation strings.
 * Extracts function name and arguments in case of Groq API gateway tool parsing bugs.
 */
function parseFailedGeneration(failedGen) {
  if (typeof failedGen !== "string") return null;

  const nameMatch = failedGen.match(/<function=(\w+)/);
  if (!nameMatch) return null;
  const name = nameMatch[1];

  const startIdx = failedGen.indexOf("{");
  const endIdx = failedGen.lastIndexOf("}");
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

  const jsonStr = failedGen.substring(startIdx, endIdx + 1);
  try {
    const args = JSON.parse(jsonStr);
    return { name, args };
  } catch (err) {
    logger.warn({ err: err.message, jsonStr }, "Failed to parse JSON from failed_generation manually");
    return null;
  }
}

/**
 * Custom wrapper around Groq API calls to implement:
 * 1. Circuit Breaker validation (fails fast if open)
 * 2. Request timeout protection (Promise.race at 25 seconds)
 * 3. Selective retry with exponential backoff on safe/transient errors
 * 4. AI health metrics recording
 */
export async function callGroqWithRetryAndTimeout(groqParams) {
  if (!circuitBreaker.checkCallAllowed()) {
    const cbError = new Error("Circuit breaker is open. Groq is unreachable.");
    cbError.name = "CircuitBreakerError";
    throw cbError;
  }

  const startTime = Date.now();

  // Controller-level request timeout (e.g. 25 seconds)
  const timeoutMs = 25000;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      const timeoutErr = new Error("Gateway timeout");
      timeoutErr.name = "GatewayTimeoutError";
      reject(timeoutErr);
    }, timeoutMs);
  });

  const groqPromise = (async () => {
    let attempt = 0;
    const maxRetries = env.GROQ_MAX_RETRIES;
    const initialDelay = env.GROQ_RETRY_DELAY_MS;

    while (true) {
      try {
        const response = await groq.chat.completions.create(groqParams);
        
        // Success
        circuitBreaker.recordSuccess();
        updateResponseTime(Date.now() - startTime);
        return response;
      } catch (err) {
        attempt++;
        
        const isRetryable = checkIsRetryable(err);
        if (!isRetryable || attempt > maxRetries) {
          circuitBreaker.recordFailure();
          recordFailureMetric(err);
          throw err;
        }

        const delay = initialDelay * Math.pow(2, attempt - 1);
        logger.warn({ err: err.message, attempt, delay }, "Groq call hit transient error. Retrying with exponential backoff...");
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  })();

  try {
    return await Promise.race([groqPromise, timeoutPromise]);
  } catch (err) {
    if (err.name === "GatewayTimeoutError") {
      circuitBreaker.recordFailure();
      recordFailureMetric(err);
    }
    throw err;
  }
}

/**
 * Classify if an error is a safe transient failure that should be retried.
 */
function checkIsRetryable(err) {
  const status = err.status || err.statusCode;
  const errMsg = err.message?.toLowerCase() || "";
  const errType = err.type?.toLowerCase() || "";
  const errName = err.name?.toLowerCase() || "";

  // Do NOT retry 400, 401, 403, 404, or invalid model requests
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return false;
  }
  if (
    errMsg.includes("invalid model") || 
    errMsg.includes("model not found") || 
    errMsg.includes("unauthorized") || 
    errMsg.includes("forbidden")
  ) {
    return false;
  }

  // Retry timeouts, rate limits, 5xx server errors, network errors
  if (
    status === 429 ||
    status === 503 ||
    status === 502 ||
    status === 504 ||
    status === 500 ||
    errName.includes("timeout") ||
    errType.includes("timeout") ||
    errType.includes("APIConnection") ||
    errMsg.includes("timeout") ||
    errMsg.includes("timed out") ||
    errMsg.includes("getaddrinfo") ||
    errMsg.includes("econnreset") ||
    errMsg.includes("enotfound") ||
    errMsg.includes("etimedout") ||
    errMsg.includes("fetch failed")
  ) {
    return true;
  }

  return false;
}


