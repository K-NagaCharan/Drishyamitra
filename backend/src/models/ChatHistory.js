import mongoose from "mongoose";

const ChatHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User association is required"]
  },
  sessionId: {
    type: String,
    required: [true, "Session ID is required"]
  },
  summary: {
    type: String,
    default: ""
  },
  userMessage: {
    type: String,
    required: [true, "User message is required"]
  },
  assistantReply: {
    type: String,
    required: [true, "Assistant reply is required"]
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index to retrieve chat history chronologically for a user
ChatHistorySchema.index({ userId: 1, createdAt: -1 });

const ChatHistory = mongoose.model("ChatHistory", ChatHistorySchema);
export default ChatHistory;
