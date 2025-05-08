// backend/routes/diagnosisRoutes.js
const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/diagnosisController");
const authMiddleware = require("../middleware/auth");

router.get("/count", authMiddleware, getDiagnosisCount);
router.get("/patients-by-severity", authMiddleware, getPatientsBySeverity);
router.get("/by-severity", authMiddleware, getDiagnosesBySeverity);
router.get("/recent", authMiddleware, getRecentDiagnoses);
router.get("/", authMiddleware, validateFetchDiagnoses, getDiagnoses);
router.post("/", authMiddleware, validateCreateDiagnosis, createDiagnosis);
router.get("/patient/:patientId", authMiddleware, validatePatientId, getDiagnosesByPatient);
router.get("/:id", authMiddleware, validateDiagnosisId, getDiagnosisById);
router.put("/:id", authMiddleware, validateUpdateDiagnosis, updateDiagnosis);
router.delete("/:id", authMiddleware, validateDiagnosisId, deleteDiagnosis);

module.exports = router;