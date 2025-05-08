const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const winston = require("winston");
const retry = require("async-retry");

// Configure logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/inference.log" }),
    new winston.transports.Console(),
  ],
});

// Environment variables for model endpoints
const YOLO_ENDPOINT = process.env.YOLO_ENDPOINT || "https://collinz56-myopia-yolo.hf.space/infer";
const RESNET_ENDPOINT =
  process.env.RESNET_ENDPOINT || "https://collinz56-myopia-resnet.hf.space/infer";
const INFERENCE_TIMEOUT = parseInt(process.env.INFERENCE_TIMEOUT) || 30000; // 30 seconds
const MAX_RETRIES = parseInt(process.env.INFERENCE_MAX_RETRIES) || 3;

const runYOLO = async (imagePath) => {
  logger.info(`Starting YOLO inference for image: ${imagePath}`);

  try {
    // Validate file exists
    if (!fs.existsSync(imagePath)) {
      logger.error(`Image file not found: ${imagePath}`);
      throw new Error("Image file not found.");
    }

    const form = new FormData();
    form.append("file", fs.createReadStream(imagePath));

    const response = await retry(
      async () => {
        const res = await axios.post(YOLO_ENDPOINT, form, {
          headers: form.getHeaders(),
          timeout: INFERENCE_TIMEOUT,
        });
        return res;
      },
      {
        retries: MAX_RETRIES,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000,
        onRetry: (err, attempt) => {
          logger.warn(`YOLO retry attempt ${attempt}: ${err.message}`);
        },
      }
    );

    const data = response.data;

    // Validate response
    if (!data.detections || !Array.isArray(data.detections)) {
      logger.error("Invalid YOLO response: missing or invalid detections");
      throw new Error("Invalid YOLO response.");
    }

    logger.info(`YOLO inference completed for image: ${imagePath}`);
    return data;
  } catch (error) {
    logger.error(`YOLO inference failed for ${imagePath}: ${error.message}`, {
      stack: error.stack,
    });
    throw new Error(`YOLO inference failed: ${error.message}`);
  }
};

const runResNet = async (imagePath) => {
  logger.info(`Starting ResNet inference for image: ${imagePath}`);

  try {
    // Validate file exists
    if (!fs.existsSync(imagePath)) {
      logger.error(`Image file not found: ${imagePath}`);
      throw new Error("Image file not found.");
    }

    const form = new FormData();
    form.append("file", fs.createReadStream(imagePath));

    const response = await retry(
      async () => {
        const res = await axios.post(RESNET_ENDPOINT, form, {
          headers: form.getHeaders(),
          timeout: INFERENCE_TIMEOUT,
        });
        return res;
      },
      {
        retries: MAX_RETRIES,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000,
        onRetry: (err, attempt) => {
          logger.warn(`ResNet retry attempt ${attempt}: ${err.message}`);
        },
      }
    );

    const data = response.data;

    // Validate response
    if (!data.severity_level || typeof data.severity_level !== "string") {
      logger.error("Invalid ResNet response: missing or invalid severity_level");
      throw new Error("Invalid ResNet response.");
    }

    logger.info(`ResNet inference completed for image: ${imagePath}`);
    return data;
  } catch (error) {
    logger.error(`ResNet inference failed for ${imagePath}: ${error.message}`, {
      stack: error.stack,
    });
    throw new Error(`ResNet inference failed: ${error.message}`);
  }
};

module.exports = {
  runYOLO,
  runResNet,
};