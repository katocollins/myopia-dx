const mongoose = require("mongoose");

const recommendationSchema = new mongoose.Schema({
  diagnosisId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Diagnosis",
    required: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
  },
  recommendationText: {
    type: String,
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Recommendation", recommendationSchema);