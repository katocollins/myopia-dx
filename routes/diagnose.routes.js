const express = require("express");
const router = express.Router();
const upload = require("../utils/multerConfig");
const diagnoseController = require("../controllers/diagnose.controller");

// POST - Upload image and run diagnosis
router.post("/", upload.single("image"), diagnoseController.runDiagnosis);

// GET - All diagnoses
router.get("/", diagnoseController.getAllDiagnoses);

// GET - Single diagnosis by ID
router.get("/:id", diagnoseController.getDiagnosisById);

module.exports = router;
