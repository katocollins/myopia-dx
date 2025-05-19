const express = require("express");
const router = express.Router();
const {
  generateRecommendation,
  validateRecommendationRequest,
} = require("../controllers/recommendationController");
const authMiddleware = require("../middleware/auth");

router.post(
  "/",
  authMiddleware,
  validateRecommendationRequest,
  generateRecommendation
);

module.exports = router;