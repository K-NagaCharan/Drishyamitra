import mongoose from "mongoose";

const FaceSchema = new mongoose.Schema({
  photoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Photo",
    required: [true, "Photo association is required"]
  },
  personId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Person",
    default: null
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User association is required"]
  },
  embedding: {
    type: [Number],
    required: [true, "Embedding is required"],
    validate: {
      validator: function(val) {
        return val && val.length === this.embeddingDimension;
      },
      message: function() {
        return `Embedding length must exactly match the embeddingDimension (${this ? this.embeddingDimension : 512})`;
      }
    }
  },
  embeddingDimension: {
    type: Number,
    required: true,
    default: 512
  },
  bbox: {
    x: { type: Number, required: [true, "Bounding box x coordinate is required"] },
    y: { type: Number, required: [true, "Bounding box y coordinate is required"] },
    w: { type: Number, required: [true, "Bounding box width is required"] },
    h: { type: Number, required: [true, "Bounding box height is required"] }
  },
  isLabeled: {
    type: Boolean,
    default: false
  },
  labelSource: {
    type: String,
    enum: ["manual", "propagation"],
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
FaceSchema.index({ personId: 1 });
FaceSchema.index({ photoId: 1 });
FaceSchema.index({ isLabeled: 1 });
FaceSchema.index({ userId: 1 });

const Face = mongoose.model("Face", FaceSchema);
export default Face;
