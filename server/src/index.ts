import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import authRoutes from "./routes/auth.routes";

import adminRoutes from "./routes/admin.routes";
import projectRoutes from "./routes/project.routes";
import "dotenv/config";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

import publicProjectRoutes from "./routes/public.project.routes";
import chatbotRoutes from "./routes/chatbot.routes";
import chatfieldRoutes from "./routes/chatfield.routes";
import scenariofieldRoutes from "./routes/scenariofield.routes";
import Settings from "./models/Settings";
import {
  setGroqModelStrong,
  setGroqModelFast,
  setGroqTemperatures,
} from "./controllers/chatbot.controller";

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);

app.use("/api/admin/projects", projectRoutes);
app.use("/api/admin/chatfields", chatfieldRoutes);
app.use("/api/admin/scenario-fields", scenariofieldRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public/projects", publicProjectRoutes);
app.use("/api/public/chat", chatbotRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const start = async () => {
  await connectDB();
  // Load model settings from DB (if present)
  try {
    const s = await Settings.findOne();
    if (s) {
      setGroqModelStrong(s.groqModelStrong);
      setGroqModelFast(s.groqModelFast);
      setGroqTemperatures(
        s.groqTemperature ?? 0.1,
        s.groqFastTemperature ?? 0.2,
      );
      console.log("Loaded GROQ model settings from DB");
    }
  } catch (err) {
    console.warn("Could not load settings:", err);
  }
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
};

start();
