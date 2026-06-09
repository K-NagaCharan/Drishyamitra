import { getSession, saveSession } from "../services/session.service.js";
import { selectModel } from "../services/modelRouter.js";
import { executeTool } from "./toolExecutor.js";
import { TOOLS } from "./tools.js";
import { saveChatHistory } from "../services/chatHistory.service.js";
import groq from "../config/groq.js";
import { logger } from "../config/logger.js";

const MAX_TOOL_DEPTH = 5;
const MAX_MESSAGES = 30;
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

  // 2. Append the user message to local memory
  const userMsg = { role: "user", content: message };
  session.messages.push(userMsg);

  // 3. Select model using deterministic heuristic
  const model = selectModel(message);

  let depth = 0;
  const executedToolCalls = [];
  let stoppedBecause = null;
  let finalReply = "";

  // Work with a local reference to session messages
  const messages = session.messages;

  // 4. Run orchestration loop
  while (depth < MAX_TOOL_DEPTH) {
    depth++;
    logger.info({ depth, model }, "Executing agent loop iteration");

    const response = await groq.chat.completions.create({
      model,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: DEFAULT_TEMPERATURE
    });

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
          result = await executeTool(name, args);
        } catch (err) {
          logger.error({ err: err.message, toolName: name }, "Tool execution failed");
          result = { error: err.message };
        }

        executedToolCalls.push({
          name,
          args,
          result
        });

        // Append tool result message
        const toolMsg = {
          role: "tool",
          tool_call_id: toolCall.id,
          name,
          content: JSON.stringify(result)
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

  // 6. Cap message history to latest 30 messages
  if (session.messages.length > MAX_MESSAGES) {
    session.messages = session.messages.slice(-MAX_MESSAGES);
  }

  // 7. Save updated session back to Redis (one single write)
  await saveSession(userId, session);

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
