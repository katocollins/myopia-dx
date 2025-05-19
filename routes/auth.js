const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getProfile,
  getUsers,
  getUserCount,
  updateProfile,
  deleteProfile,
  requestPasswordReset,
  resetPassword,
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validatePasswordReset,
  validateResetPassword,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

router.post("/register", validateRegister, register);
router.post("/login", validateLogin, login);
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, validateUpdateProfile, updateProfile);
router.get("/users", authMiddleware, getUsers); 
router.get("/users/count", authMiddleware, getUserCount);
router.delete("/profile", authMiddleware, deleteProfile);
router.post(
  "/password-reset/request",
  validatePasswordReset,
  requestPasswordReset
);
router.post("/password-reset", validateResetPassword, resetPassword);

module.exports = router;