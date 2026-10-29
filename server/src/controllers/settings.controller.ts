import { Response } from "express";
import { getSettings, saveSettings } from "../models/Settings";
import { AuthRequest } from "../middleware/auth";
import {
  setGroqModelStrong,
  setGroqModelFast,
  setGroqTemperatures,
  setGroqApiKey,
} from "./chatbot.controller";

const isValidTemperature = (t: unknown): t is number =>
  typeof t === "number" && Number.isFinite(t) && t >= 0 && t <= 2;

// GET /api/admin/settings/model
export const getModelSettings = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const s = await getSettings();
    res.json({
      model: s.groqModelStrong,
      fastModel: s.groqModelFast,
      temperature: s.groqTemperature,
      fastTemperature: s.groqFastTemperature,
      apiKey: s.groqApiKey ?? process.env.GROQ_API_KEY ?? "",
    });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ message: "Error fetching settings" });
  }
};

// POST /api/admin/settings/model
export const setModelSettings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { model, fastModel, temperature, fastTemperature, apiKey } = req.body;

    if (model !== undefined && (typeof model !== "string" || !model.trim())) {
      res.status(400).json({ message: "Model name cannot be empty" });
      return;
    }
    if (
      fastModel !== undefined &&
      (typeof fastModel !== "string" || !fastModel.trim())
    ) {
      res.status(400).json({ message: "Fast model name cannot be empty" });
      return;
    }
    if (temperature !== undefined && !isValidTemperature(temperature)) {
      res.status(400).json({ message: "Temperature must be between 0 and 2" });
      return;
    }
    if (fastTemperature !== undefined && !isValidTemperature(fastTemperature)) {
      res.status(400).json({ message: "Fast temperature must be between 0 and 2" });
      return;
    }

    const s = await getSettings();
    if (typeof model === "string") s.groqModelStrong = model.trim();
    if (typeof fastModel === "string") s.groqModelFast = fastModel.trim();
    if (typeof temperature === "number") s.groqTemperature = temperature;
    if (typeof fastTemperature === "number")
      s.groqFastTemperature = fastTemperature;
    if (apiKey !== undefined) {
      s.groqApiKey = typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
    }
    await saveSettings(s);

    // Update in-memory LLM config
    if (typeof model === "string") setGroqModelStrong(s.groqModelStrong);
    if (typeof fastModel === "string") setGroqModelFast(s.groqModelFast);
    setGroqTemperatures(s.groqTemperature, s.groqFastTemperature);
    if (apiKey !== undefined) {
      setGroqApiKey(s.groqApiKey);
    }

    res.json({
      message: "Settings updated",
      settings: {
        model: s.groqModelStrong,
        fastModel: s.groqModelFast,
        temperature: s.groqTemperature,
        fastTemperature: s.groqFastTemperature,
        apiKey: s.groqApiKey ?? process.env.GROQ_API_KEY ?? "",
      },
    });
  } catch (error) {
    console.error("Set settings error:", error);
    res.status(500).json({ message: "Error saving settings" });
  }
};
