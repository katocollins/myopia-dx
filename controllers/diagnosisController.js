const { body, param, query, validationResult } = require("express-validator");
const Diagnosis = require("../models/Diagnosis");
const RetinalImage = require("../models/RetinalImage");
const Patient = require("../models/Patient");
const { runYOLO, runResNet } = require("../services/inferenceService");
const path = require("path");
const fs = require("fs").promises;

// Input validation (unchanged)
const validateCreateDiagnosis = [
  body("retinalImageId").isMongoId().withMessage("Invalid retinal image ID"),
  body("notes").optional().trim().isLength({ max: 500 }).withMessage("Notes must be 500 characters or less"),
];

const validateUpdateDiagnosis = [
  param("id").isMongoId().withMessage("Invalid diagnosis ID"),
  body("notes").optional().trim().isLength({ max: 500 }).withMessage("Notes must be 500 characters or less"),
];

const validateDiagnosisId = [
  param("id").isMongoId().withMessage("Invalid diagnosis ID"),
];

const validatePatientId = [
  param("patientId").isMongoId().withMessage("Invalid patient ID"),
];

const validateFetchDiagnoses = [
  query("page").optional().isInt({ min: 1 }).toInt().withMessage("Invalid page number"),
  query("limit").optional().isInt({ min: 1 }).toInt().withMessage("Invalid limit"),
  query("search").optional().trim().escape(),
  query("patientId").optional().isMongoId().withMessage("Invalid patient ID"),
  query("severity").optional().isIn(["normal", "low", "medium", "high", "severe"]).withMessage("Invalid severity level"),
];

// Create a new diagnosis
const createDiagnosis = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { retinalImageId, notes } = req.body;

    const retinalImage = await RetinalImage.findById(retinalImageId).populate("patientId", "name doctorId");
    if (!retinalImage) {
      return res.status(404).json({ error: "Retinal image not found." });
    }
    if (retinalImage.patientId.doctorId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    // Check for existing diagnosis
    const existingDiagnosis = await Diagnosis.findOne({ retinalImageId });
    if (existingDiagnosis) {
      return res.status(400).json({ error: "A diagnosis already exists for this retinal image." });
    }

    const [yoloResult, resnetResult] = await Promise.all([
      runYOLO(retinalImage.originalImagePath),
      runResNet(retinalImage.originalImagePath),
    ]);

    if (!yoloResult.detections || !resnetResult.severity_level) {
      return res.status(500).json({ error: "Invalid inference results from models." });
    }

    if (yoloResult.output_image) {
      // Save the URL directly as returned by the inference API (e.g., "/static/filename.png")
      retinalImage.yoloOutputPath = yoloResult.output_image;
      await retinalImage.save();
    } else {
      retinalImage.yoloOutputPath = null;
      await retinalImage.save();
    }

    const diagnosis = await Diagnosis.create({
      retinalImageId,
      yoloDetections: yoloResult.detections,
      severityLevel: resnetResult.severity_level,
      notes,
    });

    // Populate the created diagnosis for consistent response
    const populatedDiagnosis = await Diagnosis.findById(diagnosis._id).populate({
      path: "retinalImageId",
      select: "originalImagePath yoloOutputPath patientId",
      populate: { path: "patientId", select: "name" },
    });

    res.status(201).json({
      message: "Diagnosis created successfully.",
      data: populatedDiagnosis,
    });
  } catch (error) {
    console.error("Create diagnosis error:", error);
    res.status(500).json({
      error: `Failed to create diagnosis: ${error.message}`,
    });
  }
};
// Get all diagnoses for the logged-in doctor with pagination and filters
const getDiagnoses = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { page = 1, limit = 10, search = "", patientId, severity } = req.query;

    const query = {};
    if (severity) {
      query.severityLevel = severity;
    }

    // Filter by doctorId and search/patientId
    const patientQuery = {
      doctorId: req.user.id,
      ...(search && { name: { $regex: search, $options: "i" } }),
      ...(patientId && { _id: patientId }),
    };

    const patients = await Patient.find(patientQuery).select("_id");
    const retinalImages = await RetinalImage.find({
      patientId: { $in: patients.map((p) => p._id) },
    }).select("_id");

    query.retinalImageId = { $in: retinalImages.map((img) => img._id) };

    const diagnoses = await Diagnosis.find(query)
      .populate({
        path: "retinalImageId",
        select: "originalImagePath yoloOutputPath patientId",
        populate: { path: "patientId", select: "name" },
      })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ diagnosedAt: -1 })
      .lean();

    // Filter out diagnoses with missing retinalImageId (edge case)
    const validDiagnoses = diagnoses.filter((d) => d.retinalImageId);

    const total = await Diagnosis.countDocuments(query);

    res.json({
      data: validDiagnoses,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get diagnoses error:", error);
    res.status(500).json({
      error: `Failed to fetch diagnoses: ${error.message}`,
    });
  }
};

// Get a diagnosis by ID
const getDiagnosisById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const diagnosis = await Diagnosis.findById(id)
      .populate({
        path: "retinalImageId",
        select: "originalImagePath yoloOutputPath patientId",
        populate: { path: "patientId", select: "name doctorId" }, // Include doctorId
      })
      .lean();

    if (!diagnosis) {
      return res.status(404).json({ error: "Diagnosis not found." });
    }

    if (
      !diagnosis.retinalImageId ||
      !diagnosis.retinalImageId.patientId ||
      !diagnosis.retinalImageId.patientId.doctorId ||
      diagnosis.retinalImageId.patientId.doctorId.toString() !== req.user.id
    ) {
      console.warn(
        "Unauthorized access attempt:",
        JSON.stringify({
          diagnosisId: id,
          retinalImageId: diagnosis.retinalImageId?._id,
          patientId: diagnosis.retinalImageId?.patientId?._id,
          doctorId: diagnosis.retinalImageId?.patientId?.doctorId,
          userId: req.user.id,
        })
      );
      return res.status(403).json({ error: "Unauthorized access." });
    }

    res.json({
      data: diagnosis,
    });
  } catch (error) {
    console.error("Get diagnosis error:", error);
    res.status(500).json({
      error: `Failed to fetch diagnosis: ${error.message}`,
    });
  }
};

// Update a diagnosis (e.g., notes)
const updateDiagnosis = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const diagnosis = await Diagnosis.findById(id).populate({
      path: "retinalImageId",
      select: "patientId",
      populate: { path: "patientId", select: "doctorId" },
    });

    if (!diagnosis) {
      return res.status(404).json({ error: "Diagnosis not found." });
    }

    if (
      !diagnosis.retinalImageId ||
      !diagnosis.retinalImageId.patientId ||
      !diagnosis.retinalImageId.patientId.doctorId ||
      diagnosis.retinalImageId.patientId.doctorId.toString() !== req.user.id
    ) {
      console.warn(
        "Unauthorized access attempt in updateDiagnosis:",
        JSON.stringify({
          diagnosisId: id,
          retinalImageId: diagnosis.retinalImageId?._id,
          patientId: diagnosis.retinalImageId?.patientId?._id,
          doctorId: diagnosis.retinalImageId?.patientId?.doctorId,
          userId: req.user.id,
        })
      );
      return res.status(403).json({ error: "Unauthorized access." });
    }

    diagnosis.notes = notes !== undefined ? notes : diagnosis.notes;
    await diagnosis.save();

    // Populate for response
    const populatedDiagnosis = await Diagnosis.findById(id)
      .populate({
        path: "retinalImageId",
        select: "originalImagePath yoloOutputPath patientId",
        populate: { path: "patientId", select: "name" },
      })
      .lean();

    res.json({
      data: populatedDiagnosis,
    });
  } catch (error) {
    console.error("Update diagnosis error:", error);
    res.status(500).json({
      error: `Failed to update diagnosis: ${error.message}`,
    });
  }
};

// Delete a diagnosis
const deleteDiagnosis = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const diagnosis = await Diagnosis.findById(id).populate({
      path: "retinalImageId",
      select: "yoloOutputPath patientId",
      populate: { path: "patientId", select: "doctorId" },
    });

    if (!diagnosis) {
      return res.status(404).json({ error: "Diagnosis not found." });
    }

    if (
      !diagnosis.retinalImageId ||
      !diagnosis.retinalImageId.patientId ||
      !diagnosis.retinalImageId.patientId.doctorId ||
      diagnosis.retinalImageId.patientId.doctorId.toString() !== req.user.id
    ) {
      console.warn(
        "Unauthorized access attempt in deleteDiagnosis:",
        JSON.stringify({
          diagnosisId: id,
          retinalImageId: diagnosis.retinalImageId?._id,
          patientId: diagnosis.retinalImageId?.patientId?._id,
          doctorId: diagnosis.retinalImageId?.patientId?.doctorId,
          userId: req.user.id,
        })
      );
      return res.status(403).json({ error: "Unauthorized access." });
    }

    // Clear yoloOutputPath and delete output file
    if (diagnosis.retinalImageId.yoloOutputPath) {
      try {
        await fs.unlink(path.join(__dirname, "..", diagnosis.retinalImageId.yoloOutputPath));
      } catch (fileError) {
        console.error("Error deleting YOLO output file:", fileError);
      }
      await RetinalImage.findByIdAndUpdate(diagnosis.retinalImageId._id, { yoloOutputPath: null });
    }

    await Diagnosis.deleteOne({ _id: id });

    res.json({ message: "Diagnosis deleted successfully." });
  } catch (error) {
    console.error("Delete diagnosis error:", error);
    res.status(500).json({
      error: `Failed to delete diagnosis: ${error.message}`,
    });
  }
};

// Get all diagnoses for a patient
const getDiagnosesByPatient = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { patientId } = req.params;

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found." });
    }
    if (patient.doctorId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    const diagnoses = await Diagnosis.find({ "retinalImageId.patientId": patientId })
      .populate({
        path: "retinalImageId",
        select: "originalImagePath yoloOutputPath patientId",
        populate: { path: "patientId", select: "name" },
      })
      .lean();

    // Filter out invalid diagnoses
    const validDiagnoses = diagnoses.filter((d) => d.retinalImageId);

    res.json({
      data: validDiagnoses,
    });
  } catch (error) {
    console.error("Get diagnoses by patient error:", error);
    res.status(500).json({
      error: `Failed to fetch diagnoses: ${error.message}`,
    });
  }
};

// Get total diagnosis count for the logged-in doctor
const getDiagnosisCount = async (req, res) => {
  try {
    const patients = await Patient.find({ doctorId: req.user.id }).select("_id");
    const retinalImages = await RetinalImage.find({
      patientId: { $in: patients.map((p) => p._id) },
    }).select("_id");

    const count = await Diagnosis.countDocuments({
      retinalImageId: { $in: retinalImages.map((img) => img._id) },
    });

    res.json({ count });
  } catch (error) {
    console.error("Get diagnosis count error:", error);
    res.status(500).json({ error: "Failed to fetch diagnosis count." });
  }
};

// Get patient count by severity level
const getPatientsBySeverity = async (req, res) => {
  try {
    const patients = await Patient.find({ doctorId: req.user.id }).select("_id");
    const retinalImages = await RetinalImage.find({
      patientId: { $in: patients.map((p) => p._id) },
    }).select("_id");

    const diagnoses = await Diagnosis.find({
      retinalImageId: { $in: retinalImages.map((img) => img._id) },
    })
      .populate({
        path: "retinalImageId",
        select: "patientId",
        populate: { path: "patientId", select: "_id" },
      })
      .lean();

    const patientSeverityMap = {};
    diagnoses
      .filter((d) => d.retinalImageId)
      .forEach((diagnosis) => {
        const patientId = diagnosis.retinalImageId.patientId._id.toString();
        const currentSeverity = diagnosis.severityLevel;
        if (!patientSeverityMap[patientId] || isMoreSevere(currentSeverity, patientSeverityMap[patientId])) {
          patientSeverityMap[patientId] = currentSeverity;
        }
      });

    const severityCounts = { normal: 0, low: 0, medium: 0, high: 0, severe: 0 };
    Object.values(patientSeverityMap).forEach((severity) => {
      if (severityCounts[severity] !== undefined) {
        severityCounts[severity]++;
      }
    });

    res.json(severityCounts);
  } catch (error) {
    console.error("Get patients by severity error:", error);
    res.status(500).json({ error: "Failed to fetch patients by severity." });
  }
};

// Get diagnosis count by severity level
const getDiagnosesBySeverity = async (req, res) => {
  try {
    const patients = await Patient.find({ doctorId: req.user.id }).select("_id");
    const retinalImages = await RetinalImage.find({
      patientId: { $in: patients.map((p) => p._id) },
    }).select("_id");

    const diagnoses = await Diagnosis.find({
      retinalImageId: { $in: retinalImages.map((img) => img._id) },
    }).lean();

    const severityCounts = { normal: 0, low: 0, medium: 0, high: 0, severe: 0 };
    diagnoses.forEach((diagnosis) => {
      const severity = diagnosis.severityLevel;
      if (severityCounts[severity] !== undefined) {
        severityCounts[severity]++;
      }
    });

    res.json(severityCounts);
  } catch (error) {
    console.error("Get diagnoses by severity error:", error);
    res.status(500).json({ error: "Failed to fetch diagnoses by severity." });
  }
};

// Get recent diagnoses for the logged-in doctor
const getRecentDiagnoses = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const patients = await Patient.find({ doctorId: req.user.id }).select("_id");
    const retinalImages = await RetinalImage.find({
      patientId: { $in: patients.map((p) => p._id) },
    }).select("_id");

    const diagnoses = await Diagnosis.find({
      retinalImageId: { $in: retinalImages.map((img) => img._id) },
    })
      .populate({
        path: "retinalImageId",
        select: "patientId",
        populate: { path: "patientId", select: "name" },
      })
      .sort({ diagnosedAt: -1 })
      .limit(limit)
      .lean();

    const doctorDiagnoses = diagnoses
      .filter((d) => d.retinalImageId)
      .map((diagnosis) => ({
        id: diagnosis._id,
        patientName: diagnosis.retinalImageId?.patientId?.name || "Unknown",
        severity_level: diagnosis.severityLevel,
        createdAt: diagnosis.diagnosedAt,
      }));

    res.json(doctorDiagnoses);
  } catch (error) {
    console.error("Get recent diagnoses error:", error);
    res.status(500).json({ error: "Failed to fetch recent diagnoses." });
  }
};

// Helper function to determine more severe level
const isMoreSevere = (newSeverity, oldSeverity) => {
  const severityOrder = { normal: 0, low: 1, medium: 2, high: 3, severe: 4 };
  return severityOrder[newSeverity] > severityOrder[oldSeverity];
};

module.exports = {
  createDiagnosis,
  getDiagnoses,
  getDiagnosisById,
  updateDiagnosis,
  deleteDiagnosis,
  getDiagnosesByPatient,
  getDiagnosisCount,
  getPatientsBySeverity,
  getDiagnosesBySeverity,
  getRecentDiagnoses,
  validateCreateDiagnosis,
  validateUpdateDiagnosis,
  validateDiagnosisId,
  validatePatientId,
  validateFetchDiagnoses,
};