const path = require("path");
const Diagnosis = require("../models/Diagnosis.model");
const { runYOLO, runResNet } = require("../services/inference.service");

exports.runDiagnosis = async (req, res) => {
  try {
    const inputPath = req.file.path;

    // 1. YOLO Inference
    const yoloResult = await runYOLO(inputPath);
    const yoloOutputImage = yoloResult.output_image;
    const yoloData = yoloResult.detections;

    // 2. ResNet Inference
    const resnetResult = await runResNet(inputPath);
    const severity = resnetResult.severity_level;

    // 3. Save to MongoDB
    const diagnosis = new Diagnosis({
      originalImage: inputPath,
      yoloOutputImage,
      yoloData,
      severity,
      createdAt: new Date(),
    });

    await diagnosis.save();

    res.status(200).json({
      message: "Diagnosis completed successfully.",
      data: diagnosis,
    });
  } catch (error) {
    console.error("Inference error:", error);
    res.status(500).json({ error: "Model inference failed." });
  }
};

// GET all diagnoses
exports.getAllDiagnoses = async (req, res) => {
  try {
    const records = await Diagnosis.find().sort({ createdAt: -1 });
    res.status(200).json(records);
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).json({ error: "Failed to fetch diagnoses." });
  }
};

// GET diagnosis by ID
exports.getDiagnosisById = async (req, res) => {
  try {
    const diagnosis = await Diagnosis.findById(req.params.id);
    if (!diagnosis) {
      return res.status(404).json({ error: "Diagnosis not found" });
    }
    res.status(200).json(diagnosis);
  } catch (error) {
    console.error("Fetch by ID error:", error);
    res.status(500).json({ error: "Failed to fetch diagnosis." });
  }
};
