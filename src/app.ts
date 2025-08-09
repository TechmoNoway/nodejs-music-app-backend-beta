import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

// Import models to register schemas
import "./models/Song";
import "./models/Artist";
import "./models/User";

// Import routes
import songRoutes from "./routes/songs";
import artistRoutes from "./routes/artists";
import playlistRoutes from "./routes/playlists";

// Middleware imports
import { errorHandler } from "./middleware/errorHandler";

// Load environment variables
dotenv.config();

const app = express();
// const MONGODB_URI = process.env.MONGODB_URI || "mongodb://0.0.0.0:27017/music-app";
const MONGODB_URI =
  "mongodb+srv://nguyentriky0406:mO7rXWrWKFZz7wnw@cluster0.f0fg0.mongodb.net/music-app?retryWrites=true&w=majority&appName=Cluster0";

// Trust proxy for Vercel deployment
app.set("trust proxy", 1);

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Global connection promise to avoid multiple connections
let cachedConnection: typeof mongoose | null = null;

// Database connection optimized for serverless
const connectDB = async (): Promise<typeof mongoose> => {
  if (cachedConnection && mongoose.connections[0].readyState === 1) {
    console.log("📦 Using cached MongoDB connection");
    return cachedConnection;
  }

  try {
    // Disconnect any existing connections
    if (mongoose.connections[0].readyState !== 0) {
      await mongoose.disconnect();
    }

    const clientOptions = {
      serverApi: { version: "1" as const, strict: true, deprecationErrors: true },
    };

    console.log("🔌 Connecting to MongoDB...");
    cachedConnection = await mongoose.connect(MONGODB_URI, clientOptions);

    await mongoose.connection.db?.admin().ping();

    console.log("📦 MongoDB connected successfully");
    console.log(`🗃️  Database: ${mongoose.connection.name}`);
    console.log("📋 Registered Models:", Object.keys(mongoose.models));

    return cachedConnection;
  } catch (error) {
    console.error("❌ MongoDB connection error:", (error as Error).message);
    cachedConnection = null;
    throw error;
  }
};

// Database connection middleware - ensures connection before each request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection failed:", error);
    return res.status(503).json({
      success: false,
      message: "Database service temporarily unavailable",
      error:
        process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
    });
  }
});

// Health check endpoints
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    message: "Music App API Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const dbState = mongoose.connections[0].readyState;
    const dbStatusMap: Record<number, string> = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    const dbStatus = dbStatusMap[dbState] ?? "unknown";

    // Test database connectivity
    if (dbState === 1 && mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
    }

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Music App API Server is running",
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        name: mongoose.connection.name || "unknown",
        models: Object.keys(mongoose.models),
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: "SERVICE_UNAVAILABLE",
      message: "Database health check failed",
      timestamp: new Date().toISOString(),
      error:
        process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
    });
  }
});

// API routes
app.use("/api/songs", songRoutes);
app.use("/api/artists", artistRoutes);
app.use("/api/playlists", playlistRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.path,
  });
});

export default app;
