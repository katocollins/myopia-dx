const mongoose = require("mongoose");

const retinalImageSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  originalImagePath: { type: String, required: true },
  yoloOutputPath: { type: String },
  uploadedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("RetinalImage", retinalImageSchema);
