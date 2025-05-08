// backend/controllers/retinalImageController.js
const { body, param, query, validationResult } = require("express-validator");
const RetinalImage = require("../models/RetinalImage");
const Patient = require("../models/Patient");
const Diagnosis = require("../models/Diagnosis");
const path = require("path");
const fs = require("fs").promises;

// Input validation for uploading a retinal image
const validateUploadRetinalImage = [
  body("patientId").isMongoId().withMessage("Invalid patient ID"),
];

// Input validation for getting/deleting a retinal image
const validateRetinalImageId = [
  param("id").isMongoId().withMessage("Invalid retinal image ID"),
];

// Input validation for updating a retinal image
const validateUpdateRetinalImage = [
  param("id").isMongoId().withMessage("Invalid retinal image ID"),
  body("patientId").optional().isMongoId().withMessage("Invalid patient ID"),
];

// Input validation for getting images by patient
const validatePatientId = [
  param("patientId").isMongoId().withMessage("Invalid patient ID"),
];

// Input validation for fetching all images with pagination and filters
const validateFetchRetinalImages = [
  query("page").optional().isInt({ min: 1 }).toInt().withMessage("Invalid page number"),
  query("limit").optional().isInt({ min: 1 }).toInt().withMessage("Invalid limit"),
  query("search").optional().trim().escape(),
  query("patientId").optional().isMongoId().withMessage("Invalid patient ID"),
];

// Upload a retinal image
const uploadRetinalImage = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { patientId } = req.body;
    const uploadedBy = req.user.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      await fs.unlink(file.path);
      return res.status(400).json({ error: "Only JPEG or PNG images are allowed." });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      await fs.unlink(file.path);
      return res.status(404).json({ error: "Patient not found." });
    }
    if (patient.doctorId.toString() !== req.user.id) {
      await fs.unlink(file.path);
      return res.status(403).json({ error: "Unauthorized access." });
    }

    const originalImagePath = path.join("uploads", "input", file.filename);

    try {
      await fs.access(file.path);
    } catch {
      return res.status(500).json({ error: "Failed to save image file." });
    }

    const newImage = await RetinalImage.create({
      patientId,
      uploadedBy,
      originalImagePath,
    });

    res.status(201).json({
      message: "Image uploaded successfully.",
      data: newImage,
    });
  } catch (error) {
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error("Error deleting file:", unlinkError);
      }
    }
    console.error("Upload retinal image error:", error);
    res.status(500).json({
      error: `Failed to upload retinal image: ${error.message}`,
    });
  }
};

// Get all retinal images for the logged-in doctor with pagination and filters
const getRetinalImages = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { page = 1, limit = 10, search = "", patientId } = req.query;

    const query = {};
    if (patientId) {
      query.patientId = patientId;
    }

    let images;
    let total;
    if (search) {
      // Join with Patient for name search
      const patients = await Patient.find({
        doctorId: req.user.id,
        name: { $regex: search, $options: "i" },
      }).select("_id");

      query.patientId = { $in: patients.map((p) => p._id) };
      images = await RetinalImage.find(query)
        .populate("patientId", "name")
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ uploadedAt: -1 });
      total = await RetinalImage.countDocuments(query);
    } else {
      images = await RetinalImage.find(query)
        .populate("patientId", "name")
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ uploadedAt: -1 });
      total = await RetinalImage.countDocuments(query);
    }

    res.json({
      message: "Retinal images retrieved successfully.",
      data: images,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get retinal images error:", error);
    res.status(500).json({
      error: `Failed to fetch retinal images: ${error.message}`,
    });
  }
};

// Get a retinal image by ID
const getRetinalImageById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const retinalImage = await RetinalImage.findById(id).populate({
      path: "patientId",
      select: "name doctorId",
    });

    if (!retinalImage) {
      return res.status(404).json({ error: "Retinal image not found." });
    }

    if (retinalImage.patientId.doctorId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    res.json({
      message: "Retinal image retrieved successfully.",
      data: retinalImage,
    });
  } catch (error) {
    console.error("Get retinal image error:", error);
    res.status(500).json({
      error: `Failed to fetch retinal image: ${error.message}`,
    });
  }
};

// Get all retinal images for a patient
const getRetinalImagesByPatient = async (req, res) => {
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

    const retinalImages = await RetinalImage.find({ patientId }).populate({
      path: "uploadedBy",
      select: "name",
    });

    res.json({
      message: "Retinal images retrieved successfully.",
      data: retinalImages,
    });
  } catch (error) {
    console.error("Get retinal images by patient error:", error);
    res.status(500).json({
      error: `Failed to fetch retinal images: ${error.message}`,
    });
  }
};

// Update a retinal image (e.g., patientId)
const updateRetinalImage = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { patientId } = req.body;

    const retinalImage = await RetinalImage.findById(id).populate({
      path: "patientId",
      select: "doctorId",
    });

    if (!retinalImage) {
      return res.status(404).json({ error: "Retinal image not found." });
    }

    if (retinalImage.patientId.doctorId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    if (patientId) {
      const newPatient = await Patient.findById(patientId);
      if (!newPatient) {
        return res.status(404).json({ error: "New patient not found." });
      }
      if (newPatient.doctorId.toString() !== req.user.id) {
        return res.status(403).json({ error: "Unauthorized patient access." });
      }
      retinalImage.patientId = patientId;
    }

    await retinalImage.save();

    res.json({
      message: "Retinal image updated successfully.",
      data: retinalImage,
    });
  } catch (error) {
    console.error("Update retinal image error:", error);
    res.status(500).json({
      error: `Failed to update retinal image: ${error.message}`,
    });
  }
};

// Delete a retinal image
const deleteRetinalImage = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const retinalImage = await RetinalImage.findById(id).populate({
      path: "patientId",
      select: "doctorId",
    });

    if (!retinalImage) {
      return res.status(404).json({ error: "Retinal image not found." });
    }

    if (retinalImage.patientId.doctorId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    const diagnosisCount = await Diagnosis.countDocuments({ retinalImageId: id });
    if (diagnosisCount > 0) {
      return res.status(400).json({
        error: "Cannot delete retinal image with associated diagnoses.",
      });
    }

    try {
      await fs.unlink(path.join(__dirname, "..", retinalImage.originalImagePath));
      if (retinalImage.yoloOutputPath) {
        await fs.unlink(path.join(__dirname, "..", retinalImage.yoloOutputPath));
      }
    } catch (fileError) {
      console.error("Error deleting image files:", fileError);
    }

    await RetinalImage.deleteOne({ _id: id });

    res.json({ message: "Retinal image deleted successfully." });
  } catch (error) {
    console.error("Delete retinal image error:", error);
    res.status(500).json({
      error: `Failed to delete retinal image: ${error.message}`,
    });
  }
};

// Get total retinal image count for the logged-in doctor
const getRetinalImageCount = async (req, res) => {
  try {
    const images = await RetinalImage.find().populate({
      path: "patientId",
      select: "doctorId",
    });

    const count = images.filter(
      (image) => image.patientId?.doctorId.toString() === req.user.id
    ).length;

    res.json({ count });
  } catch (error) {
    console.error("Get retinal image count error:", error);
    res.status(500).json({ error: "Failed to fetch retinal image count." });
  }
};

module.exports = {
  uploadRetinalImage,
  getRetinalImages,
  getRetinalImageById,
  getRetinalImagesByPatient,
  updateRetinalImage,
  deleteRetinalImage,
  getRetinalImageCount,
  validateUploadRetinalImage,
  validateRetinalImageId,
  validateUpdateRetinalImage,
  validatePatientId,
  validateFetchRetinalImages,
};