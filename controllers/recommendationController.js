const { GoogleGenAI } = require("@google/genai");
const { body, validationResult } = require("express-validator");
const Diagnosis = require("../models/Diagnosis");
const RetinalImage = require("../models/RetinalImage");
const Recommendation = require("../models/Recommendation");
require("dotenv").config();

// Initialize Gemini AI
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Input validation middleware
const validateRecommendationRequest = [
  body("diagnosisId")
    .notEmpty()
    .isMongoId()
    .withMessage("Valid diagnosis ID is required"),
];

// Generate recommendation using Google Gemini
const generateRecommendation = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { diagnosisId } = req.body;
    const userId = req.user.id;

    // Only allow doctors
    if (req.user.role !== "doctor") {
      return res.status(403).json({ error: "Access denied: Doctors only" });
    }

    // Fetch diagnosis
    const diagnosis = await Diagnosis.findById(diagnosisId);
    if (!diagnosis) {
      return res.status(404).json({ error: "Diagnosis not found" });
    }

    // Fetch associated retinal image
    const retinalImage = await RetinalImage.findById(diagnosis.retinalImageId);
    if (!retinalImage) {
      return res.status(404).json({ error: "Associated retinal image not found" });
    }

    // Construct prompt for Gemini
    const { severityLevel, yoloDetections, notes } = diagnosis;
    const detectionSummary = yoloDetections
      .map(
        (d) =>
          `Label: ${d.label}, Confidence: ${d.confidence}, Bounding Box: [x: ${d.boundingBox.x}, y: ${d.boundingBox.y}, w: ${d.boundingBox.width}, h: ${d.boundingBox.height}]`
      )
      .join("; ");

    const prompt = `
You are a medical AI assistant specializing in ophthalmology. Based on the following diagnosis for pathological myopia, provide a concise, professional recommendation for treatment, follow-up, or further evaluation. Use clear, actionable language suitable for a doctor.

Diagnosis Details:
- Severity Level: ${severityLevel || "Not specified"}
- YOLO Detections: ${detectionSummary || "None"}
- Doctor's Notes: ${notes || "None"}

Recommendation:
`;

    // Call Gemini model - fixed to match the correct API format
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt, // Direct prompt as string
    });

    console.log("API Response:", response);

    // Extract recommendation text
    let recommendationText = "No recommendation generated.";
    
    // Check if response has text property
    if (response && response.text) {
      recommendationText = response.text.trim();
      console.log("Extracted recommendation:", recommendationText);
    } else if (response && response.response && response.response.text) {
      // Fallback check if text is nested under response
      recommendationText = response.response.text.trim();
      console.log("Extracted recommendation from nested response:", recommendationText);
    } else {
      console.error("Failed to extract text from Gemini response:", response);
    }

    const trimmedRecommendation = recommendationText.slice(0, 1000);

    // Save to DB
    const recommendation = new Recommendation({
      diagnosisId,
      patientId: retinalImage.patientId,
      recommendationText: trimmedRecommendation,
      createdBy: userId,
    });

    await recommendation.save();

    // Return response
    res.status(201).json({
      message: "Recommendation generated successfully",
      recommendation: {
        id: recommendation._id,
        diagnosisId: recommendation.diagnosisId,
        patientId: recommendation.patientId,
        recommendationText: recommendation.recommendationText,
        createdBy: recommendation.createdBy,
        createdAt: recommendation.createdAt,
      },
    });
  } catch (error) {
    console.error("Generate recommendation error:", error);
    res.status(500).json({ error: "Server error while generating recommendation" });
  }
};

module.exports = {
  generateRecommendation,
  validateRecommendationRequest,
};