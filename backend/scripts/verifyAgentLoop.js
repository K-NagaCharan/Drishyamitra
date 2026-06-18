process.env.DRISHYAMITRA_TEST_MODE = "true";
import { runAgent } from "../src/agent/agentLoop.js";
import { clearSession, getSession } from "../src/services/session.service.js";
import groq from "../src/config/groq.js";
import { MODELS } from "../src/config/models.js";
import { logger } from "../src/config/logger.js";

const TEST_USER_ID = "663e2c9d17afbf937aef5678";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`[Assertion Failed] ${message}`);
    throw new Error(message);
  }
  logger.info(`[Assertion Passed] ${message}`);
};

const originalCreate = groq.chat.completions.create;

const setGroqMockResponses = (mockReturns) => {
  let callCount = 0;
  groq.chat.completions.create = async (options) => {
    const mockReturn = mockReturns[callCount];
    if (!mockReturn) {
      throw new Error(`Unexpected mock call index ${callCount} in current test case`);
    }
    callCount++;
    return mockReturn;
  };
};

const restoreGroq = () => {
  groq.chat.completions.create = originalCreate;
};

const runVerification = async () => {
  logger.info("Starting agent loop verification tests...");

  // Setup/clean up session
  await clearSession(TEST_USER_ID);

  try {
    // -----------------------------------------------------------------
    // TEST 1: Normal Response (No tool calls)
    // -----------------------------------------------------------------
    logger.info("--- TEST 1: Normal Response ---");
    setGroqMockResponses([
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Hello! I am your assistant.",
              tool_calls: null
            }
          }
        ]
      }
    ]);

    const res1 = await runAgent({ userId: TEST_USER_ID, message: "Hello" });
    assert(res1.reply === "Hello! I am your assistant.", "Returns correct text response");
    assert(res1.iterations === 1, "Should take exactly 1 iteration");
    assert(res1.toolCalls.length === 0, "Should have 0 tool calls executed");
    assert(res1.model === MODELS.FAST, "Should use FAST model by default");

    // -----------------------------------------------------------------
    // TEST 2: Single Tool Call
    // -----------------------------------------------------------------
    logger.info("--- TEST 2: Single Tool Call ---");
    await clearSession(TEST_USER_ID);
    setGroqMockResponses([
      // First call requests tool execution
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_001",
                  type: "function",
                  function: {
                    name: "searchPhotos",
                    arguments: JSON.stringify({ people: ["Dad"] })
                  }
                }
              ]
            }
          }
        ]
      },
      // Second call returns final response
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "I found 1 photo of Dad.",
              tool_calls: null
            }
          }
        ]
      }
    ]);

    const res2 = await runAgent({ userId: TEST_USER_ID, message: "Show Dad's photos" });
    assert(res2.reply === "I found 1 photo of Dad.", "Returns correct response after tool call");
    assert(res2.iterations === 2, "Should take exactly 2 iterations");
    assert(res2.toolCalls.length === 1, "Should record 1 tool call");
    assert(res2.toolCalls[0].name === "searchPhotos", "Executed tool name matches");
    assert(res2.toolCalls[0].args.people[0] === "Dad", "Executed tool arguments match");
    assert(Array.isArray(res2.toolCalls[0].result) && res2.toolCalls[0].result[0].id === "photo_001", "Executed tool result returned");

    // -----------------------------------------------------------------
    // TEST 3: Multiple Tool Calls in one response
    // -----------------------------------------------------------------
    logger.info("--- TEST 3: Multiple Tool Calls ---");
    await clearSession(TEST_USER_ID);
    setGroqMockResponses([
      // First call requests multiple tool executions
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_002a",
                  type: "function",
                  function: {
                    name: "searchPhotos",
                    arguments: JSON.stringify({ people: ["Mom"] })
                  }
                },
                {
                  id: "call_002b",
                  type: "function",
                  function: {
                    name: "getPeople",
                    arguments: "{}"
                  }
                }
              ]
            }
          }
        ]
      },
      // Second call returns final response
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Done processing multiple tasks.",
              tool_calls: null
            }
          }
        ]
      }
    ]);

    const res3 = await runAgent({ userId: TEST_USER_ID, message: "Find Mom's pictures and get labeled people" });
    assert(res3.reply === "Done processing multiple tasks.", "Returns response after multiple tool calls");
    assert(res3.iterations === 2, "Should take exactly 2 iterations");
    assert(res3.toolCalls.length === 2, "Should record 2 tool calls");
    assert(res3.toolCalls[0].name === "searchPhotos", "First tool was searchPhotos");
    assert(res3.toolCalls[1].name === "getPeople", "Second tool was getPeople");

    // -----------------------------------------------------------------
    // TEST 4: Malformed Tool Arguments
    // -----------------------------------------------------------------
    logger.info("--- TEST 4: Malformed Tool Arguments ---");
    await clearSession(TEST_USER_ID);
    setGroqMockResponses([
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_003",
                  type: "function",
                  function: {
                    name: "searchPhotos",
                    arguments: "{malformed_json_string" // Broken JSON
                  }
                }
              ]
            }
          }
        ]
      },
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Completed regardless of malformed argument.",
              tool_calls: null
            }
          }
        ]
      }
    ]);

    const res4 = await runAgent({ userId: TEST_USER_ID, message: "Malformed test" });
    assert(res4.reply === "Completed regardless of malformed argument.", "Handles malformed JSON safely");
    assert(res4.toolCalls.length === 1, "Recorded 1 tool call");
    assert(JSON.stringify(res4.toolCalls[0].args) === "{}", "Malformed arguments fallback to empty object");

    // -----------------------------------------------------------------
    // TEST 5: Max Tool Depth Limit (Exceeded)
    // -----------------------------------------------------------------
    logger.info("--- TEST 5: Max Tool Depth Limit ---");
    await clearSession(TEST_USER_ID);
    
    // Create an array of mock responses that repeatedly request a tool call
    const repeatingToolCall = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_loop",
                type: "function",
                function: {
                  name: "getPeople",
                  arguments: "{}"
                }
              }
            ]
          }
        }
      ]
    };
    
    const mockResponsesForDepth = Array(6).fill(repeatingToolCall);
    setGroqMockResponses(mockResponsesForDepth);

    const res5 = await runAgent({ userId: TEST_USER_ID, message: "Loop test" });
    assert(res5.reply === "The request could not be completed safely.", "Returned depth exceeded fallback response");
    assert(res5.stoppedBecause === "MAX_DEPTH", "Response specifies MAX_DEPTH");
    assert(res5.iterations === 5, "Exited agent loop at iteration 5");

    // -----------------------------------------------------------------
    // TEST 6: Session saved correctly check
    // -----------------------------------------------------------------
    logger.info("--- TEST 6: Session Save Assertions ---");
    const session = await getSession(TEST_USER_ID);
    assert(session !== null, "Session should exist in Redis");
    
    // Messages structure:
    // Index 0: User Msg ("Loop test")
    // Index 1: Assistant Msg with tool calls (Iteration 1)
    // Index 2: Tool Msg (Iteration 1 result)
    // ...
    // Verify it contains the initial user message and the final safety response
    assert(session.messages[0].role === "user" && session.messages[0].content === "Loop test", "Correct user message stored");
    const lastMsg = session.messages[session.messages.length - 1];
    assert(lastMsg.role === "assistant" && lastMsg.content === "The request could not be completed safely.", "Correct safety fallback message stored as final message");

    logger.info("ALL AGENT LOOP VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
  } finally {
    restoreGroq();
    await clearSession(TEST_USER_ID);
  }
};

runVerification().catch((err) => {
  logger.fatal(`Verification failed: ${err.message}`);
  process.exit(1);
});
