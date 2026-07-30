import { Request, Response } from "express";
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import Project from "../models/Project";
import ChatField, { IChatField } from "../models/ChatField";
import ScenarioField, { IScenarioField } from "../models/ScenarioField";

// ─── LLM Singletons ────────────────────────────────────────────────────────────

let llmStrong: ChatGroq;
let llmFast: ChatGroq;

const getStrongLlm = () => {
  if (!llmStrong) {
    llmStrong = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
    });
  }
  return llmStrong;
};

const getFastLlm = () => {
  if (!llmFast) {
    llmFast = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
    });
  }
  return llmFast;
};

// ─── Zod Schemas ────────────────────────────────────────────────────────────────

const extractionSchema = z.object({
  value: z.string().describe("The extracted/cleaned value"),
  isValid: z
    .boolean()
    .describe("Whether the value is clear and complete enough to save"),
  reason: z.string().describe("Brief rejection reason in French if invalid"),
});

const optionMatchSchema = z.object({
  matched: z
    .string()
    .describe("The best matching option from the list, exactly as written"),
  isValid: z.boolean().describe("True if a good match was found"),
});

const checkboxMatchSchema = z.object({
  matched: z
    .array(z.string())
    .describe("Array of matched options from the list"),
  isValid: z
    .boolean()
    .describe("True if at least one valid option was matched"),
});

// ─── Field Cache ─────────────────────────────────────────────────────────────

let infoCache: IChatField[] = [];
let infoCacheTime = 0;
let scenarioCache: IScenarioField[] = [];
let scenarioCacheTime = 0;
const CACHE_TTL = 30_000;

async function getActiveInfoFields(): Promise<IChatField[]> {
  const now = Date.now();
  if (infoCache.length === 0 || now - infoCacheTime > CACHE_TTL) {
    infoCache = await ChatField.find({ active: true }).sort({ order: 1 });
    infoCacheTime = now;
  }
  return infoCache;
}

async function getActiveScenarioFields(): Promise<IScenarioField[]> {
  const now = Date.now();
  if (scenarioCache.length === 0 || now - scenarioCacheTime > CACHE_TTL) {
    scenarioCache = await ScenarioField.find({ active: true }).sort({
      order: 1,
    });
    scenarioCacheTime = now;
  }
  return scenarioCache;
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildFieldQuestionPrompt(
  field: IChatField | IScenarioField,
  answers: Record<string, any>,
  rejectionReason?: string,
): string {
  let typeInstruction = "";
  if (field.type === "radio" && field.options.length > 0) {
    typeInstruction = `\nPropositions: ${field.options.join(", ")}. Affiche-les et demande de choisir.`;
  } else if (field.type === "checkbox" && field.options.length > 0) {
    typeInstruction = `\nPropositions: ${field.options.join(", ")}. Affiche-les et demande de sélectionner.`;
  }

  const previousAnswers = Object.entries(answers)
    .filter(
      ([k, v]) =>
        k !== "scenes" &&
        v &&
        (typeof v === "string"
          ? v.trim()
          : Array.isArray(v)
            ? v.length > 0
            : false),
    )
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`);

  const contextBlock =
    previousAnswers.length > 0
      ? `\nInformations déjà collectées (contexte uniquement, ne repose PAS de question dessus) :\n${previousAnswers.join("\n")}`
      : "";

  return `Tu es Tadreex Creator, assistant de conception VR pédagogique (méthode ADDIE, phase Analyse).

SUJET UNIQUE à traiter : "${field.label}"
${field.description ? `Guidage (ne pas recopier mot pour mot, reformule) : ${field.description}` : ""}${typeInstruction}
${contextBlock}

EXEMPLE de bon format (autre sujet, à titre d'illustration uniquement, ne pas réutiliser tel quel) :
"Quel est le **public cible** de cette formation ? (ex: ouvrier en atelier, résident en médecine, technicien de maintenance...)"

RÈGLES STRICTES :
- Une seule question, sur "${field.label}" uniquement. N'aborde aucun autre sujet même si l'historique de conversation t'y invite.
- Reformule le guidage avec tes propres mots, ne le recopie pas
- Maximum 2 phrases, concis et direct
- Utilise **gras** uniquement sur le mot-clé principal
- Ne salue pas, n'introduis pas
- Ignore complètement les informations déjà collectées pour choisir ta question, elles servent uniquement de contexte${rejectionReason ? `\n- La réponse précédente a été refusée car : ${rejectionReason}. Redemande poliment mais fermement, sans changer de sujet.` : ""}`;
}

function buildAckPrompt(value: string, fieldName: string): string {
  return `Confirme brièvement que tu as bien reçu l'information (1 phrase, 8 mots max). Pas de salutation, pas d'emoji.
Varie les formulations : Noté/Compris/Enregistré/OK/Parfait.
Information reçue : "${value}" pour "${fieldName}"`;
}

function buildHelpPrompt(
  field: IChatField | IScenarioField,
  answers: Record<string, any>,
): string {
  const previousAnswers = Object.entries(answers)
    .filter(
      ([k, v]) =>
        k !== "scenes" &&
        v &&
        (typeof v === "string"
          ? v.trim()
          : Array.isArray(v)
            ? v.length > 0
            : false),
    )
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  let ctx = `Question actuelle : **${field.label}**.`;
  if (field.description) ctx += ` ${field.description}`;
  if (field.options.length)
    ctx += `\nOptions possibles : ${field.options.join(", ")}`;
  if (previousAnswers)
    ctx += `\nContexte du projet déjà connu (utilise-le pour personnaliser tes exemples) :\n${previousAnswers}`;

  return `Tu aides l'utilisateur à répondre à cette question précise. Appuie-toi sur le contexte du projet déjà connu quand c'est pertinent, pour donner des exemples adaptés à son cas plutôt que génériques. Max 4 lignes, donne 2-3 exemples concrets. Utilise **gras** pour les termes-clés. Format concis.\n${ctx}`;
}

// ─── History Helper ────────────────────────────────────────────────────────────

type HistoryEntry = { role: string; content: string };

function toLlmMessages(history: HistoryEntry[], limit = 6) {
  return history.slice(-limit).map((h) => ({
    role: (h.role === "bot" ? "assistant" : "user") as "assistant" | "user",
    content: h.content,
  }));
}

// ─── Field Question Generator (strong model, real history, forced to stay on topic) ───

async function askFieldQuestion(
  field: IChatField | IScenarioField,
  answers: Record<string, any>,
  history: HistoryEntry[],
  rejectionReason?: string,
): Promise<string> {
  const prompt = buildFieldQuestionPrompt(field, answers, rejectionReason);
  const response = await getStrongLlm().invoke([
    { role: "system", content: prompt },
    ...toLlmMessages(history),
  ]);
  return response.content.toString().trim();
}

async function sendAck(value: string, fieldName: string): Promise<string> {
  const prompt = buildAckPrompt(value, fieldName);
  const response = await getFastLlm().invoke([
    { role: "system", content: prompt },
  ]);
  return response.content.toString().trim();
}

async function sendHelp(
  field: IChatField | IScenarioField,
  answers: Record<string, any>,
): Promise<string> {
  const prompt = buildHelpPrompt(field, answers);
  const response = await getStrongLlm().invoke([
    { role: "system", content: prompt },
  ]);
  return response.content.toString().trim();
}

// ─── Validators ────────────────────────────────────────────────────────────────

async function validateText(
  field: IChatField | IScenarioField,
  msg: string,
): Promise<{ valid: boolean; value: string; reason: string }> {
  const r = await getStrongLlm()
    .withStructuredOutput(extractionSchema)
    .invoke([
      {
        role: "system",
        content: `Tu valides la réponse utilisateur pour le champ "${field.label}".
${field.description ? `Contexte attendu : ${field.description}` : ""}
RÈGLES STRICTES :
- isValid = true UNIQUEMENT si la réponse est une vraie réponse sérieuse, concrète et pertinente
- isValid = false si : réponse trop vague, hors-sujet, blague, charabia, "je ne sais pas", mot isolé sans sens, injure
- N'extrais une valeur que si la réponse est réellement une tentative de réponse valide
- Sois exigeant : l'utilisateur doit fournir une information utile et concrète`,
      },
      { role: "user", content: msg },
    ]);
  return { valid: r.isValid, value: r.value, reason: r.reason };
}

async function validateRadio(
  field: IChatField | IScenarioField,
  msg: string,
): Promise<{ valid: boolean; value: string }> {
  const direct = field.options.find(
    (o) => o.trim().toLowerCase() === msg.trim().toLowerCase(),
  );
  if (direct) return { valid: true, value: direct };
  const r = await getStrongLlm()
    .withStructuredOutput(optionMatchSchema)
    .invoke([
      {
        role: "system",
        content: `Mappe le message utilisateur vers l'une de ces options : ${field.options.join(", ")}. isValid = false si hors-sujet.`,
      },
      { role: "user", content: msg },
    ]);
  return { valid: r.isValid, value: r.matched };
}

async function validateCheckbox(
  field: IChatField | IScenarioField,
  msg: string,
): Promise<{ valid: boolean; value: string[] }> {
  const vals = msg
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const direct = field.options.filter((o) =>
    vals.includes(o.trim().toLowerCase()),
  );
  if (direct.length) return { valid: true, value: direct };
  const r = await getStrongLlm()
    .withStructuredOutput(checkboxMatchSchema)
    .invoke([
      {
        role: "system",
        content: `Mappe vers les options : ${field.options.join(", ")}.`,
      },
      { role: "user", content: msg },
    ]);
  return { valid: r.isValid && r.matched.length > 0, value: r.matched };
}

// ─── Response Helpers ──────────────────────────────────────────────────────────

function respond(res: Response, data: Record<string, any>) {
  res.json(data);
}

// ─── Info Phase Logic ─────────────────────────────────────────────────────────

async function initInfoPhase(project: any, fields: IChatField[]) {
  const step = project.currentStep;
  if (step >= fields.length) {
    project.phase = "review";
    await project.save();
    return { phase: "review" as const, answers: project.answers };
  }
  const f = fields[step];
  const botMsg = await askFieldQuestion(
    f,
    project.answers,
    project.infoChatHistory,
  );
  project.infoChatHistory.push({ role: "bot", content: botMsg });
  trimHistory(project.infoChatHistory);
  await project.save();
  return {
    botMessage: botMsg,
    options: getOptionsForField(f),
    inputDisabled: f.type === "radio" && f.options.length > 0,
    phase: "info" as const,
    currentFieldLabel: f.label,
    totalFields: fields.length,
  };
}

async function handleHelpInfo(project: any, fields: IChatField[]) {
  const step = project.currentStep;
  if (step >= fields.length) {
    return {
      botMessage: "Phase d'information terminée.",
      phase: "info" as const,
    };
  }
  const f = fields[step];
  const botMsg = await sendHelp(f, project.answers);
  project.infoChatHistory.push(
    { role: "user", content: "[Aide]" },
    { role: "bot", content: botMsg },
  );
  trimHistory(project.infoChatHistory);
  await project.save();
  return {
    botMessage: botMsg,
    options: getOptionsForField(f),
    inputDisabled: f.type === "radio" && f.options.length > 0,
    phase: "info" as const,
    currentFieldLabel: f.label,
    totalFields: fields.length,
  };
}

async function processInfoAnswer(
  project: any,
  fields: IChatField[],
  msg: string,
) {
  const step = project.currentStep;
  if (step >= fields.length) {
    project.phase = "review";
    await project.save();
    return { phase: "review" as const, answers: project.answers };
  }

  const f = fields[step];
  project.infoChatHistory.push({ role: "user", content: msg });
  trimHistory(project.infoChatHistory);

  // Validate
  let valid = false;
  let value: string | string[] | null = null;
  let validationError = "";

  if (f.type === "text") {
    const r = await validateText(f, msg);
    valid = r.valid;
    if (valid) value = r.value;
    else validationError = r.reason;
  } else if (f.type === "radio") {
    const r = await validateRadio(f, msg);
    valid = r.valid;
    if (valid) value = r.value;
    else validationError = "Veuillez choisir parmi les options proposées.";
  } else if (f.type === "checkbox") {
    const r = await validateCheckbox(f, msg);
    valid = r.valid;
    if (valid) value = r.value;
    else validationError = "Veuillez sélectionner au moins une option valide.";
  }

  if (!valid || value === null) {
    const botMsg = await askFieldQuestion(
      f,
      project.answers,
      project.infoChatHistory,
      validationError,
    );
    project.infoChatHistory.push({ role: "bot", content: botMsg });
    trimHistory(project.infoChatHistory);
    await project.save();
    return {
      botMessage: botMsg,
      options: getOptionsForField(f),
      inputDisabled: f.type === "radio" && f.options.length > 0,
      phase: "info" as const,
      currentFieldLabel: f.label,
      totalFields: fields.length,
      fieldSaved: null,
    };
  }

  project.answers[f.label] = value;
  project.currentStep = step + 1;
  project.markModified("answers");

  const nextStep = step + 1;
  if (nextStep < fields.length) {
    const nf = fields[nextStep];
    const ack = await sendAck(
      Array.isArray(value) ? value.join(", ") : String(value),
      f.label,
    );
    const nq = await askFieldQuestion(
      nf,
      project.answers,
      project.infoChatHistory,
    );
    const botMsg = `${ack}\n\n${nq}`;
    project.infoChatHistory.push({ role: "bot", content: botMsg });
    trimHistory(project.infoChatHistory);
    await project.save();
    return {
      botMessage: botMsg,
      options: getOptionsForField(nf),
      inputDisabled: nf.type === "radio" && nf.options.length > 0,
      phase: "info" as const,
      currentFieldLabel: nf.label,
      totalFields: fields.length,
      fieldSaved: f.label,
    };
  }

  // All fields done
  const ack = await sendAck(
    Array.isArray(value) ? value.join(", ") : String(value),
    f.label,
  );
  const botMsg = `${ack}\n\nToutes les informations sont collectées.`;
  project.infoChatHistory.push({ role: "bot", content: botMsg });
  trimHistory(project.infoChatHistory);
  project.phase = "review";
  await project.save();
  return {
    botMessage: botMsg,
    phase: "review" as const,
    answers: project.answers,
  };
}

// ─── Scenario Phase Logic ──────────────────────────────────────────────────────

async function initScenarioPhase(
  project: any,
  scenario: any,
  fields: IScenarioField[],
) {
  const step = scenario.currentField || 0;
  if (step >= fields.length) {
    scenario.currentField = fields.length;
    project.markModified("scenarios");
    await project.save();
    return { botMessage: "Scénario terminé.", done: true };
  }
  const f = fields[step];
  const botMsg = await askFieldQuestion(
    f,
    { ...project.answers, ...scenario.answers },
    scenario.chatHistory,
  );
  scenario.chatHistory.push({ role: "bot", content: botMsg });
  trimHistory(scenario.chatHistory);
  project.markModified("scenarios");
  await project.save();
  return {
    botMessage: botMsg,
    options: getOptionsForField(f),
    inputDisabled: f.type === "radio" && f.options.length > 0,
    currentFieldLabel: f.label,
    totalFields: fields.length,
  };
}

async function handleHelpScenario(
  project: any,
  scenario: any,
  fields: IScenarioField[],
) {
  const step = scenario.currentField || 0;
  if (step >= fields.length) {
    return { botMessage: "Scénario terminé." };
  }
  const f = fields[step];
  const botMsg = await sendHelp(f, { ...project.answers, ...scenario.answers });
  scenario.chatHistory.push(
    { role: "user", content: "[Aide]" },
    { role: "bot", content: botMsg },
  );
  trimHistory(scenario.chatHistory);
  project.markModified("scenarios");
  await project.save();
  return {
    botMessage: botMsg,
    options: getOptionsForField(f),
    inputDisabled: f.type === "radio" && f.options.length > 0,
    currentFieldLabel: f.label,
    totalFields: fields.length,
  };
}

async function processScenarioAnswer(
  project: any,
  scenario: any,
  fields: IScenarioField[],
  msg: string,
) {
  const step = scenario.currentField || 0;
  if (step >= fields.length) {
    return { botMessage: "Ce scénario est déjà terminé.", done: true };
  }

  const f = fields[step];
  scenario.chatHistory.push({ role: "user", content: msg });
  trimHistory(scenario.chatHistory);

  let valid = false;
  let value: string | string[] | null = null;
  let validationError = "";

  if (f.type === "text") {
    const r = await validateText(f, msg);
    valid = r.valid;
    if (valid) value = r.value;
    else validationError = r.reason;
  } else if (f.type === "radio") {
    const r = await validateRadio(f, msg);
    valid = r.valid;
    if (valid) value = r.value;
    else validationError = "Veuillez choisir parmi les options proposées.";
  } else if (f.type === "checkbox") {
    const r = await validateCheckbox(f, msg);
    valid = r.valid;
    if (valid) value = r.value;
    else validationError = "Veuillez sélectionner au moins une option valide.";
  }

  if (!valid || value === null) {
    const botMsg = await askFieldQuestion(
      f,
      { ...project.answers, ...scenario.answers },
      scenario.chatHistory,
      validationError,
    );
    scenario.chatHistory.push({ role: "bot", content: botMsg });
    trimHistory(scenario.chatHistory);
    project.markModified("scenarios");
    await project.save();
    return {
      botMessage: botMsg,
      options: getOptionsForField(f),
      inputDisabled: f.type === "radio" && f.options.length > 0,
      currentFieldLabel: f.label,
      totalFields: fields.length,
    };
  }

  scenario.answers[f.label] = value;
  const nextStep = step + 1;
  scenario.currentField = nextStep;

  if (nextStep < fields.length) {
    const nf = fields[nextStep];
    const ack = await sendAck(
      Array.isArray(value) ? value.join(", ") : String(value),
      f.label,
    );
    const nq = await askFieldQuestion(
      nf,
      { ...project.answers, ...scenario.answers },
      scenario.chatHistory,
    );
    const botMsg = `${ack}\n\n${nq}`;
    scenario.chatHistory.push({ role: "bot", content: botMsg });
    trimHistory(scenario.chatHistory);
    project.markModified("scenarios");
    await project.save();
    return {
      botMessage: botMsg,
      options: getOptionsForField(nf),
      inputDisabled: nf.type === "radio" && nf.options.length > 0,
      currentFieldLabel: nf.label,
      totalFields: fields.length,
    };
  }

  const ack = await sendAck(
    Array.isArray(value) ? value.join(", ") : String(value),
    f.label,
  );
  const botMsg = `${ack}\n\nCe scénario est complet.`;
  scenario.chatHistory.push({ role: "bot", content: botMsg });
  trimHistory(scenario.chatHistory);
  project.markModified("scenarios");
  await project.save();
  return { botMessage: botMsg, done: true };
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function trimHistory(
  history: Array<{ role: string; content: string }>,
  max = 40,
) {
  if (history.length > max) {
    history.splice(0, history.length - max);
  }
}

function getOptionsForField(
  field: IChatField | IScenarioField,
): string[] | null {
  if (
    (field.type === "radio" || field.type === "checkbox") &&
    field.options.length > 0
  ) {
    return field.options;
  }
  return null;
}

// ─── Main Info Chat Handler ────────────────────────────────────────────────────

export const handleChatMessage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token } = req.params;
    const { userMessage } = req.body;
    if (!userMessage) {
      res.status(400).json({ message: "userMessage is required" });
      return;
    }

    const project = await Project.findOne({ clientToken: token });
    if (!project) {
      res.status(404).json({ message: "Projet introuvable" });
      return;
    }

    // --- System commands ---
    if (userMessage === "__confirm__") {
      project.phase = "scenario";
      project.status = "in_progress";
      project.scenarios.push({
        name: "Scénario 1",
        currentField: 0,
        chatHistory: [],
        answers: {},
      });
      await project.save();
      respond(res, {
        phase: "scenario",
        answers: project.answers,
        scenarios: project.scenarios,
        scenarioFields: await getActiveScenarioFields(),
      });
      return;
    }

    if (userMessage === "__scenario_done__") {
      project.phase = "completed";
      project.status = "completed";
      await project.save();
      respond(res, { phase: "completed" });
      return;
    }

    // --- Phase routing ---
    if (project.phase === "info") {
      const fields = await getActiveInfoFields();

      if (userMessage === "__init__") {
        respond(res, await initInfoPhase(project, fields));
        return;
      }

      if (userMessage === "__help__") {
        respond(res, await handleHelpInfo(project, fields));
        return;
      }

      respond(res, await processInfoAnswer(project, fields, userMessage));
      return;
    }

    if (project.phase === "review") {
      respond(res, {
        phase: "review",
        answers: project.answers,
        message: "Confirmez pour continuer.",
      });
      return;
    }

    res.status(400).json({ message: "Phase invalide." });
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ message: "Erreur. Réessayez." });
  }
};

// ─── Scenario Chat Handler ─────────────────────────────────────────────────────

export const handleScenarioMessage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token, scenarioIndex } = req.params;
    const { userMessage } = req.body;
    if (!userMessage) {
      res.status(400).json({ message: "userMessage required" });
      return;
    }

    const project = await Project.findOne({ clientToken: token });
    if (!project || project.phase !== "scenario") {
      res
        .status(400)
        .json({ message: "Projet non trouvé ou pas en phase scénario." });
      return;
    }

    const idx = parseInt(scenarioIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= project.scenarios.length) {
      res.status(400).json({ message: "Index de scénario invalide." });
      return;
    }

    const scenario = project.scenarios[idx] as any;
    const fields = await getActiveScenarioFields();

    if (userMessage === "__init__") {
      respond(res, await initScenarioPhase(project, scenario, fields));
      return;
    }

    if (userMessage === "__help__") {
      respond(res, await handleHelpScenario(project, scenario, fields));
      return;
    }

    respond(
      res,
      await processScenarioAnswer(project, scenario, fields, userMessage),
    );
  } catch (err) {
    console.error("Scenario error:", err);
    res.status(500).json({ message: "Erreur. Réessayez." });
  }
};

// ─── Scenario Block Management ─────────────────────────────────────────────────

export const addScenarioBlock = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token } = req.params;
    const { name } = req.body;
    const project = await Project.findOne({ clientToken: token });
    if (!project) {
      res.status(404).json({ message: "Projet introuvable" });
      return;
    }

    project.scenarios.push({
      name: name || `Scénario ${project.scenarios.length + 1}`,
      currentField: 0,
      chatHistory: [],
      answers: {},
    });
    project.markModified("scenarios");
    await project.save();
    respond(res, { scenarios: project.scenarios });
  } catch (err) {
    console.error("Error adding scenario:", err);
    res.status(500).json({ message: "Erreur ajout scénario." });
  }
};

export const deleteScenarioBlock = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token, scenarioIndex } = req.params;
    const idx = parseInt(scenarioIndex, 10);
    const project = await Project.findOne({ clientToken: token });
    if (!project) {
      res.status(404).json({ message: "Projet introuvable" });
      return;
    }
    if (isNaN(idx) || idx < 0 || idx >= project.scenarios.length) {
      res.status(400).json({ message: "Index invalide." });
      return;
    }
    project.scenarios.splice(idx, 1);
    project.markModified("scenarios");
    await project.save();
    respond(res, { scenarios: project.scenarios });
  } catch (err) {
    console.error("Error deleting scenario:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

export const getScenarioBlocks = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token } = req.params;
    const project = await Project.findOne({ clientToken: token });
    if (!project) {
      res.status(404).json({ message: "Projet introuvable" });
      return;
    }
    respond(res, {
      phase: project.phase,
      answers: project.answers,
      scenarios: project.scenarios,
      scenarioFields: await getActiveScenarioFields(),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur." });
  }
};
