const mongoose = require("mongoose");

const diagnosisSchema = new mongoose.Schema({
  retinalImageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RetinalImage",
    required: true,
  },
  yoloDetections: [
    {
      label: String,
      confidence: Number,
      boundingBox: {
        x: Number,
        y: Number,
        width: Number,
        height: Number,
      },
    },
  ],
  severityLevel: {
    type: String,
    enum: ["normal", "low", "medium", "high", "severe"],
  },
  notes: { type: String },
  diagnosedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Diagnosis", diagnosisSchema);
