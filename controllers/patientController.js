// backend/controllers/patientController.js
const { body, validationResult, query } = require("express-validator");
const Patient = require("../models/Patient");
const RetinalImage = require("../models/RetinalImage");

// Input validation middleware for creating a patient
const validateCreatePatient = [
  body("name").notEmpty().trim().withMessage("Name is required"),
  body("gender")
    .isIn(["male", "female", "other"])
    .withMessage("Invalid gender"),
  body("contactInfo.email")
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage("Invalid email"),
  body("contactInfo.phone")
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage("Invalid phone number"),
  body("dateOfBirth")
    .optional()
    .isISO8601()
    .toDate()
    .withMessage("Invalid date of birth"),
  body("address").optional().trim(),
];

// Input validation middleware for updating a patient
const validateUpdatePatient = [
  body("name").optional().notEmpty().trim().withMessage("Name cannot be empty"),
  body("gender")
    .optional()
    .isIn(["male", "female", "other"])
    .withMessage("Invalid gender"),
  body("contactInfo.email")
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage("Invalid email"),
  body("contactInfo.phone")
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage("Invalid phone number"),
  body("dateOfBirth")
    .optional()
    .isISO8601()
    .toDate()
    .withMessage("Invalid date of birth"),
  body("address").optional().trim(),
];

// Input validation for fetching patients
const validateFetchPatients = [
  query("page").optional().isInt({ min: 1 }).toInt().withMessage("Invalid page number"),
  query("limit").optional().isInt({ min: 1 }).toInt().withMessage("Invalid limit"),
  query("search").optional().trim().escape(),
];

// Create a new patient
const createPatient = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, gender, dateOfBirth, contactInfo, address } = req.body;

    if (contactInfo?.email) {
      const existing = await Patient.findOne({
        "contactInfo.email": contactInfo.email,
      });
      if (existing) {
        return res.status(400).json({ error: "Patient email already exists." });
      }
    }

    const patient = new Patient({
      doctorId: req.user.id,
      name,
      gender,
      dateOfBirth,
      contactInfo: {
        email: contactInfo?.email,
        phone: contactInfo?.phone,
      },
      address,
    });

    await patient.save();
    res.status(201).json({
      message: "Patient created successfully.",
      data: patient,
    });
  } catch (error) {
    console.error("Create patient error:", error);
    res.status(500).json({ error: "Failed to create patient." });
  }
};

// Get all patients for the logged-in doctor with pagination and search
const getPatients = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { page = 1, limit = 10, search = "" } = req.query;
    const query = { doctorId: req.user.id };
    if (search) {
      query.name = { $regex: search, $options: "i" }; // Case-insensitive search
    }

    const patients = await Patient.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select("name gender dateOfBirth contactInfo address");
    const total = await Patient.countDocuments(query);

    res.json({
      message: "Patients retrieved successfully.",
      data: patients,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get patients error:", error);
    res.status(500).json({ error: "Failed to fetch patients." });
  }
};

// Get a single patient by ID
const getPatientById = async (req, res) => {
  try {
    const patient = await Patient.findOne({
      _id: req.params.id,
      doctorId: req.user.id,
    });
    if (!patient) {
      return res.status(404).json({ error: "Patient not found." });
    }
    res.json({
      message: "Patient retrieved successfully.",
      data: patient,
    });
  } catch (error) {
    console.error("Get patient error:", error);
    res.status(500).json({ error: "Failed to fetch patient." });
  }
};

// Update a patient
const updatePatient = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, gender, dateOfBirth, contactInfo, address } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (gender) updates.gender = gender;
    if (dateOfBirth) updates.dateOfBirth = dateOfBirth;
    if (address) updates.address = address;
    if (contactInfo) updates.contactInfo = {
      email: contactInfo.email,
      phone: contactInfo.phone,
    };

    if (contactInfo?.email) {
      const existing = await Patient.findOne({
        "contactInfo.email": contactInfo.email,
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(400).json({ error: "Patient email already exists." });
      }
    }

    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, doctorId: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!patient) {
      return res.status(404).json({ error: "Patient not found." });
    }

    res.json({
      message: "Patient updated successfully.",
      data: patient,
    });
  } catch (error) {
    console.error("Update patient error:", error);
    res.status(500).json({ error: "Failed to update patient." });
  }
};

// Delete a patient
const deletePatient = async (req, res) => {
  try {
    const imageCount = await RetinalImage.countDocuments({
      patientId: req.params.id,
    });
    if (imageCount > 0) {
      return res.status(400).json({
        error: "Cannot delete patient with associated retinal images.",
      });
    }

    const patient = await Patient.findOneAndDelete({
      _id: req.params.id,
      doctorId: req.user.id,
    });

    if (!patient) {
      return res.status(404).json({ error: "Patient not found." });
    }

    res.json({ message: "Patient deleted successfully." });
  } catch (error) {
    console.error("Delete patient error:", error);
    res.status(500).json({ error: "Failed to delete patient." });
  }
};

// Get total patient count for the logged-in doctor
const getPatientCount = async (req, res) => {
  try {
    const count = await Patient.countDocuments({ doctorId: req.user.id });
    res.json({ count });
  } catch (error) {
    console.error("Get patient count error:", error);
    res.status(500).json({ error: "Failed to fetch patient count." });
  }
};

// Get active patient count (patients with recent activity)
const getActivePatientCount = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const patientIdsWithImages = await RetinalImage.distinct("patientId", {
      doctorId: req.user.id,
      createdAt: { $gte: thirtyDaysAgo },
    });

    const count = await Patient.countDocuments({
      doctorId: req.user.id,
      $or: [
        { updatedAt: { $gte: thirtyDaysAgo } },
        { _id: { $in: patientIdsWithImages } },
      ],
    });

    res.json({ count });
  } catch (error) {
    console.error("Get active patient count error:", error);
    res.status(500).json({ error: "Failed to fetch active patient count." });
  }
};

// Get patient count by gender
const getPatientsByGender = async (req, res) => {
  try {
    const result = await Patient.aggregate([
      { $match: { doctorId: req.user.id } },
      { $group: { _id: "$gender", count: { $sum: 1 } } },
      { $project: { _id: 0, gender: "$_id", count: 1 } },
    ]);

    const genderMap = { male: 0, female: 0, other: 0 };
    result.forEach((item) => (genderMap[item.gender] = item.count));
    res.json(genderMap);
  } catch (error) {
    console.error("Get patients by gender error:", error);
    res.status(500).json({ error: "Failed to fetch patients by gender." });
  }
};

module.exports = {
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  validateCreatePatient,
  validateUpdatePatient,
  validateFetchPatients,
  getPatientCount,
  getActivePatientCount,
  getPatientsByGender,
};
