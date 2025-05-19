const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer");
const swaggerUi = require("swagger-ui-express");
const yaml = require("js-yaml");
const fs = require("fs");
require("dotenv").config();

// Import routes
const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patient");
const retinalImageRoutes = require("./routes/retinalImage");
const diagnosisRoutes = require("./routes/diagnosis");
const recommendationRoutes = require("./routes/recommendation");

// Initialize Express app
const app = express();

// Validate environment variables
const requiredEnvVars = [
  "MONGO_URI",
  "JWT_SECRET",
  "FRONTEND_URL",
  "EMAIL_USER",
  "EMAIL_PASS",
  "YOLO_ENDPOINT",
  "RESNET_ENDPOINT",
];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing environment variable: ${envVar}`);
    process.exit(1);
  }
}

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:5173" || "https://myopia-frontend.vercel.app",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// // Serve uploaded images securely
// app.use(
//   "/uploads",
//   express.static(path.join(__dirname, "Uploads"), {
//   })
// );

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Load Swagger YAML and serve Swagger UI
const swaggerDocument = yaml.load(fs.readFileSync("./swagger.yaml", "utf8"));
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true, // Keep JWT token between requests
    },
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/retinal-images", retinalImageRoutes);
app.use("/api/diagnoses", diagnosisRoutes);
app.use("/api/recommendations", recommendationRoutes); 

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected successfully.");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // Exit process on failure
  }
};
connectDB();

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Multer error: ${err.message}` });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: `Validation error: ${err.message}` });
  }
  res.status(500).json({
    error: `Internal server error: ${err.message}`,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
});

module.exports = app;
