// backend/routes/patientRoutes.js
const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/patientController");
const authMiddleware = require("../middleware/auth");

router.get("/count", authMiddleware, getPatientCount);
router.get("/active-count", authMiddleware, getActivePatientCount);
router.get("/by-gender", authMiddleware, getPatientsByGender);
router.post("/", authMiddleware, validateCreatePatient, createPatient);
router.get("/", authMiddleware, validateFetchPatients, getPatients);
router.get("/:id", authMiddleware, getPatientById);
router.put("/:id", authMiddleware, validateUpdatePatient, updatePatient);
router.delete("/:id", authMiddleware, deletePatient);

module.exports = router;
