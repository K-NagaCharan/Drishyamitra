import mongoose from "mongoose";

const PersonSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User association is required"]
  },
  name: {
    type: String,
    required: [true, "Person name is required"],
    trim: true
  },
  nameNormalized: {
    type: String,
    required: [true, "Normalized name is required"],
    lowercase: true,
    trim: true
  },
  centroid: {
    type: [Number],
    default: null
  },
  centroidCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound unique index to prevent duplicate named persons for the same user
PersonSchema.index({ userId: 1, nameNormalized: 1 }, { unique: true });

const Person = mongoose.model("Person", PersonSchema);
export default Person;
