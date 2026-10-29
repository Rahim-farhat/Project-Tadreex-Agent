import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { connectDB } from "./config/db";
import { protect, adminOnly } from "./middleware/auth";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import projectRoutes from "./routes/project.routes";
import publicProjectRoutes from "./routes/public.project.routes";
import chatbotRoutes from "./routes/chatbot.routes";
import chatfieldRoutes from "./routes/chatfield.routes";
import scenariofieldRoutes from "./routes/scenariofield.routes";
import { getSettings } from "./models/Settings";
import { ensureAdminUser } from "./models/User";
import {
  setGroqModelStrong,
  setGroqModelFast,
  setGroqTemperatures,
  setGroqApiKey,
  isRateLimitError,
  formatRateLimitPayload,
} from "./controllers/chatbot.controller";

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is not defined in environment variables");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.disable("x-powered-by");
// Behind Caddy/nginx in production: trust the first proxy hop
app.set("trust proxy", 1);
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);

// Project routes — authenticated users (admin sees all, managers see/create up to 10 of their own)
app.use("/api/admin/projects", protect, projectRoutes);

// Admin-only routes — only the admin can change chat/scenario fields and manage settings/managers
app.use("/api/admin/chatfields", protect, adminOnly, chatfieldRoutes);
app.use("/api/admin/scenario-fields", protect, adminOnly, scenariofieldRoutes);
app.use("/api/admin", adminRoutes);

// Public routes — access is scoped by the project's client token
app.use("/api/public/projects", publicProjectRoutes);
app.use("/api/public/chat", chatbotRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ message: "Invalid JSON body" });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ message: "Request body too large" });
    return;
  }
  if (isRateLimitError(err)) {
    console.error("Unhandled RateLimit error:", err);
    res.status(429).json(formatRateLimitPayload("Step error", err));
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const start = async () => {
  await connectDB();
  await ensureAdminUser();
  // Load model settings from DB
  try {
    const s = await getSettings();
    setGroqModelStrong(s.groqModelStrong);
    setGroqModelFast(s.groqModelFast);
    setGroqTemperatures(s.groqTemperature, s.groqFastTemperature);
    if (s.groqApiKey) {
      setGroqApiKey(s.groqApiKey);
    }
    console.log("Loaded GROQ model settings from DB");
  } catch (err) {
    console.warn("Could not load settings:", err);
  }
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
};

start();
