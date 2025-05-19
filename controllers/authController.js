const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Patient = require("../models/Patient");
const RetinalImage = require("../models/RetinalImage");
const PasswordResetToken = require("../models/PasswordResetToken"); // New model
const { sendEmail } = require("../services/emailService"); // Placeholder for email service
const { body, validationResult } = require("express-validator");

// Input validation middleware for registration
const validateRegister = [
  body("name").notEmpty().trim().withMessage("Name is required"),
  body("email").isEmail().normalizeEmail().withMessage("Invalid email"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("role")
    .optional()
    .isIn(["doctor", "admin"])
    .withMessage("Invalid role"),
];

// Input validation middleware for login
const validateLogin = [
  body("email").isEmail().normalizeEmail().withMessage("Invalid email"),
  body("password").notEmpty().withMessage("Password is required"),
];

// Input validation middleware for profile update
const validateUpdateProfile = [
  body("name").optional().notEmpty().trim().withMessage("Name cannot be empty"),
  body("email")
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage("Invalid email"),
];

// Input validation middleware for password reset
const validatePasswordReset = [
  body("email").isEmail().normalizeEmail().withMessage("Invalid email"),
];

const validateResetPassword = [
  body("token").notEmpty().withMessage("Token is required"),
  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
];

// Register a new user
const register = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new User({ name, email, passwordHash, role });
    await user.save();

    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Server error during registration." });
  }
};

// Login a user
const login = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error during login." });
  }
};

// Get logged-in user's profile
const getProfile = async (req, res) => {
  try {
    // req.user is set by auth middleware
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Server error while fetching profile." });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;

    // Check if new email is already taken
    if (email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: req.user.id },
      });
      if (existingUser) {
        return res.status(400).json({ error: "Email already in use." });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({
      message: "Profile updated successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Server error while updating profile." });
  }
};

// Delete user account
const deleteProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check for dependencies (patients or retinal images)
    const patientCount = await Patient.countDocuments({ doctorId: userId });
    const imageCount = await RetinalImage.countDocuments({ uploadedBy: userId });
    if (patientCount > 0 || imageCount > 0) {
      return res.status(400).json({
        error: "Cannot delete user with associated patients or retinal images.",
      });
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ message: "User account deleted successfully." });
  } catch (error) {
    console.error("Delete profile error:", error);
    res.status(500).json({ error: "Server error while deleting profile." });
  }
};

// Request password reset
const requestPasswordReset = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User with this email not found." });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = await bcrypt.hash(resetToken, 10);
    const resetTokenExpires = Date.now() + 3600000; // 1 hour

    // Save reset token to PasswordResetToken collection
    await PasswordResetToken.create({
      userId: user._id,
      token: resetTokenHash,
      expires: resetTokenExpires,
    });

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const emailContent = `
      <p>You requested a password reset.</p>
      <p>Click <a href="${resetUrl}">here</a> to reset your password.</p>
      <p>This link expires in 1 hour.</p>
    `;
    await sendEmail(user.email, "Password Reset Request", emailContent);

    res.json({ message: "Password reset link sent to email." });
  } catch (error) {
    console.error("Request password reset error:", error);
    res.status(500).json({
      error: "Server error while requesting password reset.",
    });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, newPassword } = req.body;

    // Find valid reset token
    const resetToken = await PasswordResetToken.findOne({
      expires: { $gt: Date.now() },
    }).populate("userId");

    if (!resetToken || !resetToken.userId) {
      return res
        .status(400)
        .json({ error: "Invalid or expired reset token." });
    }

    // Verify token
    const isTokenValid = await bcrypt.compare(token, resetToken.token);
    if (!isTokenValid) {
      return res
        .status(400)
        .json({ error: "Invalid or expired reset token." });
    }

    // Update user's password
    const user = await User.findById(resetToken.userId._id);
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Delete the used reset token
    await PasswordResetToken.deleteOne({ _id: resetToken._id });

    res.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Server error while resetting password." });
  }
};

// Fetch paginated users (for admin)
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const query = {
      role: "doctor", // Only fetch doctors
      ...(search && { name: { $regex: search, $options: "i" } }),
    };

    const users = await User.find(query)
      .select("-passwordHash")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const totalUsers = await User.countDocuments(query);

    res.json({
      users,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Server error while fetching users." });
  }
};

// Fetch total user count (for admin)
const getUserCount = async (req, res) => {
  try {
    const count = await User.countDocuments({ role: "doctor" });
    res.json({ count });
  } catch (error) {
    console.error("Get user count error:", error);
    res.status(500).json({ error: "Server error while fetching user count." });
  }
};



module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  deleteProfile,
  requestPasswordReset,
  resetPassword,
  getUsers,
  getUserCount,
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validatePasswordReset,
  validateResetPassword,
};


