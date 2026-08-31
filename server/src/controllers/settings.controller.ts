import { Request, Response } from "express";
import Settings from "../models/Settings";
import { AuthRequest } from "../middleware/auth";
import {
  setGroqModelStrong,
  setGroqModelFast,
  setGroqTemperatures,
} from "./chatbot.controller";

// GET /api/admin/settings/model
export const getModelSettings = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  let s = await Settings.findOne();
  if (!s) {
    s = await Settings.create({});
  }
  res.json({
    model: s.groqModelStrong,
    fastModel: s.groqModelFast,
    temperature: s.groqTemperature,
    fastTemperature: s.groqFastTemperature,
  });
};

// POST /api/admin/settings/model
export const setModelSettings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { model, fastModel, temperature, fastTemperature } = req.body;
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  if (typeof model === "string") s.groqModelStrong = model;
  if (typeof fastModel === "string") s.groqModelFast = fastModel;
  if (typeof temperature === "number") s.groqTemperature = temperature;
  if (typeof fastTemperature === "number")
    s.groqFastTemperature = fastTemperature;
  await s.save();

  // Update in-memory LLM config
  if (typeof model === "string") setGroqModelStrong(s.groqModelStrong);
  if (typeof fastModel === "string") setGroqModelFast(s.groqModelFast);
  setGroqTemperatures(s.groqTemperature, s.groqFastTemperature);

  res.json({
    message: "Settings updated",
    settings: {
      model: s.groqModelStrong,
      fastModel: s.groqModelFast,
      temperature: s.groqTemperature,
      fastTemperature: s.groqFastTemperature,
    },
  });
};
