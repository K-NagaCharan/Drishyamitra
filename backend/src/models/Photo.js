import mongoose from "mongoose";

const PhotoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User association is required"]
  },
  url: {
    type: String,
    required: [true, "Photo URL is required"]
  },
  cloudinaryPublicId: {
    type: String,
    required: [true, "Cloudinary public ID is required"]
  },
  width: {
    type: Number
  },
  height: {
    type: Number
  },
  status: {
    type: String,
    enum: ["processing", "completed", "failed"],
    default: "processing"
  },
  bytes: {
    type: Number
  },
  originalName: {
    type: String
  },
  faceCount: {
    type: Number,
    default: 0
  },
  uploadDate: {
    type: Date,
    default: Date.now
  }
}, {
  toObject: { virtuals: true },
  toJSON: { virtuals: true }
});

// Virtual getter for standardizing on Photo.imageUrl
PhotoSchema.virtual("imageUrl").get(function () {
  return this.url;
});

// Indexes
PhotoSchema.index({ userId: 1, uploadDate: -1 });
PhotoSchema.index({ userId: 1 });
PhotoSchema.index({ status: 1 });

const Photo = mongoose.model("Photo", PhotoSchema);
export default Photo;
