// backend/routes/retinalImageRoutes.js
const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/retinalImageController");
const authMiddleware = require("../middleware/auth");
const multer = require("multer");

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/input/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/jpg"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG and PNG are allowed."));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.get("/count", authMiddleware, getRetinalImageCount);
router.post(
  "/",
  authMiddleware,
  upload.single("image"),
  validateUploadRetinalImage,
  uploadRetinalImage
);
router.get("/", authMiddleware, validateFetchRetinalImages, getRetinalImages);
router.get("/patient/:patientId", authMiddleware, validatePatientId, getRetinalImagesByPatient);
router.get("/:id", authMiddleware, validateRetinalImageId, getRetinalImageById);
router.put("/:id", authMiddleware, validateUpdateRetinalImage, updateRetinalImage);
router.delete("/:id", authMiddleware, validateRetinalImageId, deleteRetinalImage);

module.exports = router;