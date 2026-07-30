import { Request, Response } from "express";
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import Project from "../models/Project";
import ChatField, { IChatField } from "../models/ChatField";
import ScenarioField, { IScenarioField } from "../models/ScenarioField";

// ─── Singletons ───────────────────────────────────────────────────────────────

let llmStrong: ChatGroq;
let llmFast: ChatGroq;

const getStrongLlm = () => {
  if (!llmStrong) {
    llmStrong = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.15,
    });
  }
  return llmStrong;
};

const getFastLlm = () => {
  if (!llmFast) {
    llmFast = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
    });
  }
  return llmFast;
};

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const extractionSchema = z.object({
  value: z.string().describe("The extracted/cleaned value"),
  isValid: z.boolean().describe("Whether the value is clear and complete enough to save"),
  reason: z.string().describe("Brief reason why it is or is not valid (in French)"),
});

const optionMatchSchema = z.object({
  matched: z.string().describe("The best matching option from the list, exactly as written"),
  isValid: z.boolean().describe("True if a good match was found"),
});

const checkboxMatchSchema = z.object({
  matched: z.array(z.string()).describe("Array of matched options from the list"),
  isValid: z.boolean().describe("True if at least one valid option was matched"),
});

// ─── History Formatter ─────────────────────────────────────────────────────────

const formatHistoryForLLM = (
  chatHistory: Array<{ role: "user" | "bot"; content: string }>,
  maxTurns = 6,
): string => {
  const recent = chatHistory.slice(-maxTurns * 2);
  if (recent.length === 0) return "";
  return recent
    .map((t) => `${t.role === "user" ? "Utilisateur" : "Bot"}: ${t.content}`)
    .join("\n");
};

// ─── Context Builder ──────────────────────────────────────────────────────────

const getContextStr = (answers: Record<string, any>): string => {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(answers)) {
    if (key === "scenes") continue;
    if (val && (typeof val === "string" ? val.trim() : val.length > 0)) {
      parts.push(`- ${key}: ${Array.isArray(val) ? val.join(", ") : val}`);
    }
  }
  return parts.length > 0 ? parts.join("\n") : "Aucun contexte défini pour l'instant.";
};

// ─── Question Generators (shared by info and scenario phases) ──────────────────

async function generateFieldQuestion(
  field: IChatField | IScenarioField,
  answers: Record<string, any>,
  chatHistory: Array<{ role: "user" | "bot"; content: string }>,
  rejectionReason?: string,
): Promise<string> {
  const history = formatHistoryForLLM(chatHistory);
  const context = getContextStr(answers);
  let typeInstruction = "";
  if (field.type === "radio" && field.options.length > 0) {
    typeInstruction = `\nPropositions: ${field.options.join(", ")}. Affiche-les et demande de choisir.`;
  } else if (field.type === "checkbox" && field.options.length > 0) {
    typeInstruction = `\nPropositions (${field.options.join(", ")}). Affiche-les et demande de sélectionner.`;
  }

  const prompt = `Tu es Tadreex Creator, assistant de conception VR. Tu poses une question précise à l'utilisateur.
RÈGLES:
- **Une seule question** à la fois
- Maximum 2 phrases, concis et direct
- Utilise **gras** pour le mot-clé principal
- Ne pose PAS la prochaine question avant d'avoir reçu une réponse valide à celle-ci
- Pas de salutation ni d'introduction

Question à poser: ${field.label}${field.description ? ` (${field.description})` : ""}${typeInstruction}
${rejectionReason ? `\nRaison du refus: ${rejectionReason}. Redemande poliment mais fermement une réponse valide.` : ""}
${context !== "Aucun contexte défini pour l'instant." ? `Contexte du projet:\n${context}` : ""}
${history ? `\nNe pas répéter ce qui a déjà été dit:\n${history}` : ""}`;

  const response = await getFastLlm().invoke([{ role: "system", content: prompt }]);
  return response.content.toString().trim();
}

async function generateAck(
  value: string,
  fieldName: string,
  chatHistory: Array<{ role: "user" | "bot"; content: string }>,
): Promise<string> {
  const history = formatHistoryForLLM(chatHistory, 3);
  const prompt = `Confirme brièvement (1 phrase, 8 mots max). Pas de salutation, pas d'emoji.
Varie les formulations: Noté/Compris/Enregistré/OK/Parfait. Info: "${value}" pour "${fieldName}"
${history ? `Ne pas répéter ce contenu:\n${history}` : ""}`;
  const response = await getFastLlm().invoke([{ role: "system", content: prompt }]);
  return response.content.toString().trim();
}

async function generateHelp(
  field: IChatField | IScenarioField,
  answers: Record<string, any>,
  chatHistory: Array<{ role: "user" | "bot"; content: string }>,
): Promise<string> {
  const history = formatHistoryForLLM(chatHistory);
  const context = getContextStr(answers);
  let ctx = `Aide pour: **${field.label}**.`;
  if (field.description) ctx += ` ${field.description}`;
  if (field.options.length) ctx += `\nOptions possibles: ${field.options.join(", ")}`;
  const prompt = `Tu aides l'utilisateur à répondre. Max 4 lignes, donne 2-3 exemples concrets. **gras** pour les termes-clés. Format concis.\n${ctx}\n${context !== "Aucun contexte défini pour l'instant." ? `Contexte:\n${context}` : ""}${history ? `\nNe pas répéter:\n${history}` : ""}`;
  const response = await getFastLlm().invoke([{ role: "system", content: prompt }]);
  return response.content.toString().trim();
}

// ─── Validators ───────────────────────────────────────────────────────────────

async function validateText(field: IChatField | IScenarioField, msg: string) {
  const r = await getStrongLlm().withStructuredOutput(extractionSchema).invoke([
    {
      role: "system",
      content: `Tu valides la réponse utilisateur pour le champ "${field.label}".
${field.description ? `Contexte: ${field.description}` : ""}
RÈGLES STRICTES:
- isValid = true UNIQUEMENT si la réponse est une vraie réponse sérieuse et pertinente à la question posée
- isValid = false si: réponse trop vague, hors-sujet, blague, charabia, "je ne sais pas", mot isolé sans sens, injure
- N'extrais une valeur que si la réponse est réellement une tentative de réponse valide
- Sois exigeant: l'utilisateur doit fournir une information utile et concrète`,
    },
    { role: "user", content: msg },
  ]);
  return { valid: r.isValid, value: r.value, reason: r.reason };
}

async function validateRadio(field: IChatField | IScenarioField, msg: string) {
  const direct = field.options.find((o) => o.toLowerCase() === msg.toLowerCase());
  if (direct) return { valid: true, value: direct };
  const r = await getStrongLlm().withStructuredOutput(optionMatchSchema).invoke([
    { role: "system", content: `Mappe vers: ${field.options.join(", ")}. isValid=false si hors-sujet.` },
    { role: "user", content: msg },
  ]);
  return { valid: r.isValid, value: r.matched };
}

async function validateCheckbox(field: IChatField | IScenarioField, msg: string) {
  const vals = msg.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const direct = field.options.filter((o) => vals.some((v) => v.toLowerCase() === o.toLowerCase()));
  if (direct.length) return { valid: true, value: direct };
  const r = await getStrongLlm().withStructuredOutput(checkboxMatchSchema).invoke([
    { role: "system", content: `Mappe vers les options: ${field.options.join(", ")}.` },
    { role: "user", content: msg },
  ]);
  return { valid: r.isValid && r.matched.length > 0, value: r.matched };
}

// ─── Caches ───────────────────────────────────────────────────────────────────

let infoCache: IChatField[] = [];
let infoCacheTime = 0;
const CACHE_TTL = 30_000;

async function getActiveInfoFields(): Promise<IChatField[]> {
  const now = Date.now();
  if (infoCache.length === 0 || now - infoCacheTime > CACHE_TTL) {
    infoCache = await ChatField.find({ active: true }).sort({ order: 1 });
    infoCacheTime = now;
  }
  return infoCache;
}

let scenarioCache: IScenarioField[] = [];
let scenarioCacheTime = 0;

async function getActiveScenarioFields(): Promise<IScenarioField[]> {
  const now = Date.now();
  if (scenarioCache.length === 0 || now - scenarioCacheTime > CACHE_TTL) {
    scenarioCache = await ScenarioField.find({ active: true }).sort({ order: 1 });
    scenarioCacheTime = now;
  }
  return scenarioCache;
}

// ─── Main Chat Handler (Phase: info + confirm) ────────────────────────────────

export const handleChatMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { userMessage } = req.body;
    if (!userMessage) { res.status(400).json({ message: "userMessage is required" }); return; }

    const project = await Project.findOne({ clientToken: token });
    if (!project) { res.status(404).json({ message: "Projet introuvable" }); return; }

    // __confirm__ transitions from review to scenario phase
    if (userMessage === "__confirm__") {
      project.phase = "scenario";
      project.status = "in_progress";
      // Create first scenario block
      project.scenarios.push({
        name: "Scénario 1",
        currentField: 0,
        chatHistory: [],
        answers: {},
      });
      await project.save();

      res.json({
        phase: "scenario",
        answers: project.answers,
        scenarios: project.scenarios,
        scenarioFields: await getActiveScenarioFields(),
      });
      return;
    }

    // __scenario_done__ marks project completed
    if (userMessage === "__scenario_done__") {
      project.phase = "completed";
      project.status = "completed";
      await project.save();
      res.json({ phase: "completed" });
      return;
    }

    // Phase info: normal chatbot flow
    if (project.phase === "info") {
      return await handleInfoPhase(req, res, project, userMessage);
    }

    // Phase review is handled client-side, only __confirm__ is accepted
    if (project.phase === "review") {
      res.json({ phase: "review", answers: project.answers, message: "Confirmez pour continuer." });
      return;
    }

    res.status(400).json({ message: "Phase invalide." });
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ message: "Erreur. Réessayez." });
  }
};

// ─── Phase: Info ──────────────────────────────────────────────────────────────

async function handleInfoPhase(req: Request, res: Response, project: any, userMessage: string) {
  const fields = await getActiveInfoFields();
  const step = project.currentStep;
  const history = project.infoChatHistory || [];
  const answers = (project.answers || {}) as Record<string, any>;
  const totalFields = fields.length;

  const saveHistory = () => {
    if (project.infoChatHistory.length > 40) project.infoChatHistory = project.infoChatHistory.slice(-40);
  };

  // __init__
  if (userMessage === "__init__") {
    let botMsg: string; let opts: string[] | null = null; let disabled = false;
    if (step < totalFields) {
      const f = fields[step];
      botMsg = await generateFieldQuestion(f, answers, history);
      if (f.type === "radio" && f.options.length) { opts = f.options; disabled = true; }
      else if (f.type === "checkbox" && f.options.length) { opts = f.options; }
    } else {
      botMsg = "Toutes les informations ont été collectées.";
    }
    project.infoChatHistory.push({ role: "bot", content: botMsg });
    saveHistory();
    await project.save();
    res.json({ botMessage: botMsg, options: opts, inputDisabled: disabled, phase: "info", nextStep: step, totalFields, currentFieldLabel: step < totalFields ? fields[step].label : null });
    return;
  }

  // __help__
  if (userMessage === "__help__") {
    let botMsg: string; let opts: string[] | null = null; let disabled = false;
    if (step < totalFields) {
      const f = fields[step];
      botMsg = await generateHelp(f, answers, history);
      if (f.type === "radio" && f.options.length) { opts = f.options; disabled = true; }
      else if (f.type === "checkbox" && f.options.length) { opts = f.options; }
    } else {
      botMsg = "Phase d'information terminée.";
    }
    project.infoChatHistory.push({ role: "user", content: "[Aide]" });
    project.infoChatHistory.push({ role: "bot", content: botMsg });
    saveHistory();
    await project.save();
    res.json({ botMessage: botMsg, options: opts, inputDisabled: disabled, phase: "info", nextStep: step, totalFields, currentFieldLabel: step < totalFields ? fields[step].label : null });
    return;
  }

  // Normal message
  project.infoChatHistory.push({ role: "user", content: userMessage });
  saveHistory();

  if (step < totalFields) {
    await handleInfoFieldStep(req, res, project, fields, step, userMessage);
  } else {
    // All fields done, transition to review
    project.phase = "review";
    project.markModified("answers");
    await project.save();
    res.json({ phase: "review", answers: project.answers, botMessage: null, totalFields });
  }
}

async function handleInfoFieldStep(req: Request, res: Response, project: any, fields: IChatField[], step: number, userMessage: string) {
  let botMsg = ""; let opts: string[] | null = null; let disabled = false; let nextStep = step;
  const history = project.infoChatHistory || [];
  const answers = (project.answers || {}) as Record<string, any>;
  const f = fields[step];
  let value: string | string[] | null = null; let valid = false;

  if (f.type === "text") { const r = await validateText(f, userMessage); valid = r.valid; if (valid) value = r.value; else botMsg = await generateFieldQuestion(f, answers, history, r.reason); }
  else if (f.type === "radio") { const r = await validateRadio(f, userMessage); valid = r.valid; if (valid) value = r.value; else botMsg = await generateFieldQuestion(f, answers, history, `Options: ${f.options.join(", ")}`); }
  else if (f.type === "checkbox") { const r = await validateCheckbox(f, userMessage); valid = r.valid; if (valid) value = r.value; else botMsg = await generateFieldQuestion(f, answers, history, `Options: ${f.options.join(", ")}`); }

  if (valid && value !== null) {
    project.answers[f.label] = value;
    nextStep = step + 1;
    if (nextStep < fields.length) {
      const nf = fields[nextStep];
      const ack = await generateAck(Array.isArray(value) ? value.join(", ") : String(value), f.label, history);
      const nq = await generateFieldQuestion(nf, answers, history);
      botMsg = `${ack}\n\n${nq}`;
      if (nf.type === "radio" && nf.options.length) { opts = nf.options; disabled = true; }
      else if (nf.type === "checkbox" && nf.options.length) { opts = nf.options; }
    } else {
      const ack = await generateAck(Array.isArray(value) ? value.join(", ") : String(value), f.label, history);
      botMsg = `${ack}\n\nToutes les informations sont collectées.`;
      project.phase = "review";
    }
  }

  project.currentStep = nextStep;
  project.markModified("answers");
  project.infoChatHistory.push({ role: "bot", content: botMsg });
  if (project.infoChatHistory.length > 40) project.infoChatHistory = project.infoChatHistory.slice(-40);
  await project.save();

  res.json({
    botMessage: botMsg, options: opts, inputDisabled: disabled, fieldSaved: f.label,
    nextStep, totalFields: fields.length, currentFieldLabel: nextStep < fields.length ? fields[nextStep].label : null,
    phase: project.phase,
    answers: project.phase === "review" ? project.answers : undefined,
  });
}

// ─── Scenario Phase Handlers ──────────────────────────────────────────────────

export const handleScenarioMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, scenarioIndex } = req.params;
    const { userMessage } = req.body;
    if (!userMessage) { res.status(400).json({ message: "userMessage required" }); return; }

    const project = await Project.findOne({ clientToken: token });
    if (!project || project.phase !== "scenario") {
      res.status(400).json({ message: "Projet non trouvé ou pas en phase scénario." });
      return;
    }

    const idx = parseInt(scenarioIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= project.scenarios.length) {
      res.status(400).json({ message: "Index de scénario invalide." });
      return;
    }

    const scenario = project.scenarios[idx] as any;
    const fields = await getActiveScenarioFields();
    const step = scenario.currentField || 0;
    const history = scenario.chatHistory || [];
    const sAnswers = scenario.answers || {};
    const totalFields = fields.length;

    const saveScenario = () => {
      if (scenario.chatHistory.length > 40) scenario.chatHistory = scenario.chatHistory.slice(-40);
      project.markModified("scenarios");
    };

    // __init__
    if (userMessage === "__init__") {
      let botMsg: string; let opts: string[] | null = null; let disabled = false;
      if (step < totalFields) {
        const f = fields[step];
        botMsg = await generateFieldQuestion(f, { ...project.answers, ...sAnswers }, history);
        if (f.type === "radio" && f.options.length) { opts = f.options; disabled = true; }
        else if (f.type === "checkbox" && f.options.length) { opts = f.options; }
      } else {
        botMsg = "Scénario terminé.";
      }
      scenario.chatHistory.push({ role: "bot", content: botMsg });
      saveScenario();
      await project.save();
      res.json({ botMessage: botMsg, options: opts, inputDisabled: disabled, nextStep: step, totalFields, currentFieldLabel: step < totalFields ? fields[step].label : null });
      return;
    }

    // __help__
    if (userMessage === "__help__") {
      let botMsg: string; let opts: string[] | null = null; let disabled = false;
      if (step < totalFields) {
        const f = fields[step];
        botMsg = await generateHelp(f, { ...project.answers, ...sAnswers }, history);
        if (f.type === "radio" && f.options.length) { opts = f.options; disabled = true; }
        else if (f.type === "checkbox" && f.options.length) { opts = f.options; }
      } else {
        botMsg = "Scénario terminé.";
      }
      scenario.chatHistory.push({ role: "user", content: "[Aide]" });
      scenario.chatHistory.push({ role: "bot", content: botMsg });
      saveScenario();
      await project.save();
      res.json({ botMessage: botMsg, options: opts, inputDisabled: disabled, nextStep: step, totalFields, currentFieldLabel: step < totalFields ? fields[step].label : null });
      return;
    }

    // Normal message
    scenario.chatHistory.push({ role: "user", content: userMessage });
    saveScenario();

    if (step < totalFields) {
      await handleScenarioFieldStep(req, res, project, idx, fields, step, userMessage);
    } else {
      res.json({ botMessage: "Toutes les questions de ce scénario sont complétées.", done: true, nextStep: step, totalFields });
    }
  } catch (err) {
    console.error("Scenario error:", err);
    res.status(500).json({ message: "Erreur. Réessayez." });
  }
};

async function handleScenarioFieldStep(req: Request, res: Response, project: any, scIdx: number, fields: IScenarioField[], step: number, userMessage: string) {
  const scenario = project.scenarios[scIdx] as any;
  const history = scenario.chatHistory || [];
  const sAnswers = scenario.answers || {};
  const allCtx = { ...project.answers, ...sAnswers };
  const f = fields[step];
  let botMsg = ""; let opts: string[] | null = null; let disabled = false; let nextStep = step;
  let value: string | string[] | null = null; let valid = false;

  if (f.type === "text") { const r = await validateText(f, userMessage); valid = r.valid; if (valid) value = r.value; else botMsg = await generateFieldQuestion(f, allCtx, history, r.reason); }
  else if (f.type === "radio") { const r = await validateRadio(f, userMessage); valid = r.valid; if (valid) value = r.value; else botMsg = await generateFieldQuestion(f, allCtx, history, `Options: ${f.options.join(", ")}`); }
  else if (f.type === "checkbox") { const r = await validateCheckbox(f, userMessage); valid = r.valid; if (valid) value = r.value; else botMsg = await generateFieldQuestion(f, allCtx, history, `Options: ${f.options.join(", ")}`); }

  if (valid && value !== null) {
    scenario.answers[f.label] = value;
    nextStep = step + 1;
    if (nextStep < fields.length) {
      const nf = fields[nextStep];
      const ack = await generateAck(Array.isArray(value) ? value.join(", ") : String(value), f.label, history);
      const nq = await generateFieldQuestion(nf, allCtx, history);
      botMsg = `${ack}\n\n${nq}`;
      if (nf.type === "radio" && nf.options.length) { opts = nf.options; disabled = true; }
      else if (nf.type === "checkbox" && nf.options.length) { opts = nf.options; }
    } else {
      const ack = await generateAck(Array.isArray(value) ? value.join(", ") : String(value), f.label, history);
      botMsg = `${ack}\n\nCe scénario est complet.`;
    }
  }

  scenario.currentField = nextStep;
  scenario.chatHistory.push({ role: "bot", content: botMsg });
  if (scenario.chatHistory.length > 40) scenario.chatHistory = scenario.chatHistory.slice(-40);
  project.markModified("scenarios");
  await project.save();

  res.json({ botMessage: botMsg, options: opts, inputDisabled: disabled, nextStep, totalFields: fields.length, currentFieldLabel: nextStep < fields.length ? fields[nextStep].label : null, done: nextStep >= fields.length });
}

// ─── Scenario Block Management ────────────────────────────────────────────────

export const addScenarioBlock = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { name } = req.body;
    const project = await Project.findOne({ clientToken: token });
    if (!project) { res.status(404).json({ message: "Projet introuvable" }); return; }

    const scNum = project.scenarios.length + 1;
    project.scenarios.push({
      name: name || `Scénario ${scNum}`,
      currentField: 0,
      chatHistory: [],
      answers: {},
    });
    project.markModified("scenarios");
    await project.save();
    res.json({ scenarios: project.scenarios });
  } catch (err) {
    console.error("Error adding scenario:", err);
    res.status(500).json({ message: "Erreur ajout scénario." });
  }
};

export const deleteScenarioBlock = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, scenarioIndex } = req.params;
    const idx = parseInt(scenarioIndex, 10);
    const project = await Project.findOne({ clientToken: token });
    if (!project) { res.status(404).json({ message: "Projet introuvable" }); return; }
    if (isNaN(idx) || idx < 0 || idx >= project.scenarios.length) {
      res.status(400).json({ message: "Index invalide." }); return;
    }
    project.scenarios.splice(idx, 1);
    project.markModified("scenarios");
    await project.save();
    res.json({ scenarios: project.scenarios });
  } catch (err) {
    console.error("Error deleting scenario:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

export const getScenarioBlocks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const project = await Project.findOne({ clientToken: token });
    if (!project) { res.status(404).json({ message: "Projet introuvable" }); return; }
    res.json({
      phase: project.phase,
      answers: project.answers,
      scenarios: project.scenarios,
      scenarioFields: await getActiveScenarioFields(),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur." });
  }
};
