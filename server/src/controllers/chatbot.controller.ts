import { Request, Response } from "express";
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import Project from "../models/Project";
import ChatField, { IChatField } from "../models/ChatField";
import ScenarioField, { IScenarioField } from "../models/ScenarioField";

// ─── LLM Singletons ────────────────────────────────────────────────────────────

let llmStrong: ChatGroq | undefined;
let llmFast: ChatGroq | undefined;

// In-memory configuration (defaults)
let groqModelStrong = "openai/gpt-oss-120b";
let groqModelFast = "openai/gpt-oss-20b";
let groqTemperature = 0.1;
let groqFastTemperature = 0.2;

export const setGroqModelStrong = (m: string) => {
  groqModelStrong = m;
  llmStrong = undefined;
};
export const setGroqModelFast = (m: string) => {
  groqModelFast = m;
  llmFast = undefined;
};
export const setGroqTemperatures = (t: number, ft: number) => {
  groqTemperature = t;
  groqFastTemperature = ft;
  llmStrong = undefined;
  llmFast = undefined;
};

const getStrongLlm = () => {
  if (!llmStrong) {
    llmStrong = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: groqModelStrong,
      temperature: groqTemperature,
    });
  }
  return llmStrong;
};

const getFastLlm = () => {
  if (!llmFast) {
    llmFast = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: groqModelFast,
      temperature: groqFastTemperature,
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

const stepFieldSchema = z.object({
  value: z
    .string()
    .describe("La valeur nettoyée et réécrite en français, sans mise en forme."),
  isValid: z
    .boolean()
    .describe("true si la réponse contient une information sérieuse et exploitable pour ce champ."),
  reason: z
    .string()
    .describe("Raison du refus en français si la valeur est invalide, sinon chaîne vide."),
});

const stepModifySchema = z.object({
  updates: z
    .record(z.string(), z.string())
    .nullable()
    .describe("Valeurs clairement fournies par l'utilisateur pour modifier un ou plusieurs champs (clés possibles : titre, action, resultat, objets3d, ui, animations, validation, statut). null si aucune valeur exploitable."),
  message: z
    .string()
    .describe("Confirmation courte si des valeurs sont mises à jour, ou question de clarification si aucune valeur exploitable (en français)."),
});

const suggestionsSchema = z.object({
  suggestions: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe(
      "Suggestions complètes, rédigées en français, directement utilisables comme la réponse du participant au champ demandé (sans tiret, sans mise en forme markdown).",
    ),
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

export async function getActiveScenarioFields(): Promise<IScenarioField[]> {
  const now = Date.now();
  if (scenarioCache.length === 0 || now - scenarioCacheTime > CACHE_TTL) {
    scenarioCache = await ScenarioField.find({ active: true }).sort({ order: 1 });
    scenarioCacheTime = now;
  }
  return scenarioCache;
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildFieldQuestionPrompt(
  field: IChatField,
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

function buildInfoSuggestionsPrompt(
  field: IChatField,
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
    ctx += `\nOptions possibles (le participant doit répondre par l'une d'elles) : ${field.options.join(", ")}`;
  if (previousAnswers)
    ctx += `\nContexte du projet déjà connu (à utiliser pour personnaliser les exemples) :\n${previousAnswers}`;

  return `Tu proposes des réponses toutes prêtes à l'utilisateur pour renseigner « ${field.label} ».
${ctx}

CHAQUE suggestion doit :
- Être une réponse complète, directement utilisable telle quelle pour « ${field.label} »
- Être en français correct, concise (1 à 2 lignes max)
- Être adaptée au contexte du projet connu${field.options.length ? "\n- Respecter l'une des options possibles (la reprendre plus ou moins telle quelle)" : ""}
- Sans puces ni mise en forme markdown dans la suggestion elle-même`;
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
  field: IChatField,
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

async function sendInfoSuggestions(
  field: IChatField,
  answers: Record<string, any>,
): Promise<string[]> {
  const prompt = buildInfoSuggestionsPrompt(field, answers);
  const r = await getStrongLlm()
    .withStructuredOutput(suggestionsSchema)
    .invoke([{ role: "system", content: prompt }]);
  return r.suggestions || [];
}

// ─── Validators ────────────────────────────────────────────────────────────────

async function validateText(
  field: IChatField,
  msg: string,
  projectAnswers?: Record<string, any>,
): Promise<{ valid: boolean; value: string; reason: string }> {
  // Build project context so the LLM knows the domain
  let projectContext = "";
  if (projectAnswers) {
    const relevant = Object.entries(projectAnswers)
      .filter(
        ([k, v]) =>
          k !== "scenes" &&
          v &&
          (typeof v === "string" ? v.trim() : Array.isArray(v) ? v.length > 0 : true),
      )
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    if (relevant) projectContext = `\nContexte du projet :\n${relevant}\n`;
  }

  const r = await getStrongLlm()
    .withStructuredOutput(extractionSchema)
    .invoke([
      {
        role: "system",
        content: `Tu valides la réponse utilisateur pour le champ "${field.label}".
${field.description ? `Contexte attendu : ${field.description}` : ""}${projectContext}
RÈGLES STRICTES :
- isValid = true si la réponse est une vraie réponse sérieuse, concrète et en rapport avec le champ demandé
- isValid = false si : réponse trop vague, blague, charabia, "je ne sais pas", mot isolé sans sens, injure
- N'impose PAS un domaine spécifique (médical, mécanique, etc.) : accepte tout domaine tant que la réponse est sérieuse
- N'extrais une valeur que si la réponse est réellement une tentative de réponse valide`,
      },
      { role: "user", content: msg },
    ]);
  return { valid: r.isValid, value: r.value, reason: r.reason };
}

async function validateRadio(
  field: IChatField,
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
  field: IChatField,
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
  const suggestions = await sendInfoSuggestions(f, project.answers);
  const botMsg =
    suggestions.length > 0
      ? `Voici quelques suggestions pour **${f.label}**. Sélectionnez-en une ou plusieurs, modifiez-les si besoin, puis validez.`
      : `Je n'ai pas trouvé de suggestions pour « ${f.label} ». Répondez directement dans votre style.`;
  project.infoChatHistory.push(
    { role: "user", content: "[Aide]" },
    { role: "bot", content: botMsg },
  );
  trimHistory(project.infoChatHistory);
  await project.save();
  return {
    botMessage: botMsg,
    ...(suggestions.length > 0 ? { suggestions } : {}),
    options: null,
    inputDisabled: false,
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
    const r = await validateText(f, msg, project.answers);
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

// ─── Scenario Step Builder (guided, une question à la fois) ────────────────────

const STEP_ALL_KEYS = [
  "titre",
  "action",
  "resultat",
  "objets3d",
  "ui",
  "animations",
  "validation",
  "statut",
] as const;

const STEP_ASK_KEYS = [
  { key: "titre", label: "l'intitulé de l'étape" },
  { key: "action", label: "l'action gestuelle du participant" },
  {
    key: "resultat",
    label: "le résultat attendu / l'interaction dans la simulation",
  },
  { key: "objets3d", label: "les objets / assets 3D nécessaires" },
  { key: "ui", label: "l'interface utilisateur (UI)" },
  { key: "animations", label: "les animations / effets visuels (VFX)" },
  {
    key: "validation",
    label: "la règle de validation et le feedback de l'étape",
  },
] as const;

const STEP_FIELD_SPECS: Record<
  string,
  {
    label: string;
    description: string;
    questionPrompt: string;
    helpGuidance: string;
    validationExpected: string;
  }
> = {
  titre: {
    label: "l'intitulé de l'étape",
    description: "Nom court et explicite de l'étape décrivant la tâche.",
    questionPrompt:
      "Demande quel est le titre court et clair de cette étape (ex: « Positionnement de la roue », « Serrage des écrous »).",
    helpGuidance:
      "Donne 2-3 exemples de titres d'étape courts et clairs adaptés au sujet de la formation.",
    validationExpected: "Un nom ou titre court décrivant l'étape.",
  },
  action: {
    label: "l'action gestuelle du participant",
    description:
      "Ce que le participant fait physiquement avec ses mains/manettes dans la VR.",
    questionPrompt:
      "Demande quelle action gestuelle ou manipulation physique le participant effectue avec ses mains ou manettes VR pour cette étape.",
    helpGuidance:
      "Donne 2-3 exemples d'actions gestuelles concrètes (manipulations avec les mains/manettes VR, saisie, déplacement, rotation d'outil). Ne décris pas l'UI ni les règles de validation.",
    validationExpected:
      "Une description de gestes physiques ou manipulations réalisées par le participant avec les contrôleurs VR.",
  },
  resultat: {
    label: "le résultat / interaction dans la simulation",
    description:
      "Ce que la simulation VR produit en réaction à l'action (comportement des objets 3D, snap, feedback physique).",
    questionPrompt:
      "Demande comment réagit la simulation VR quand l'action est faite (aimantation/snap de la pièce, son de clic mécanique, rotation visible, changement d'état).",
    helpGuidance:
      "Donne 2-3 exemples de réactions du monde virtuel (ex: « La jante s'aimante (snap) sur les goujons, rotation visible de l'écrou avec son de cliquet, blocage de la clé au couple requis »). ATTENTION: Ne redonne pas les gestes de l'utilisateur, décris la réaction de la simulation.",
    validationExpected:
      "La réaction ou le comportement de la simulation VR suite à l'action (feedback visuel, sonore, aimantation/snap, état de l'objet).",
  },
  objets3d: {
    label: "les objets / assets 3D nécessaires",
    description:
      "Liste des objets, outils, pièces et assets 3D modélisés pour cette étape.",
    questionPrompt:
      "Demande quels modèles 3D, outils et accessoires interactifs doivent être modélisés et présents dans la scène VR pour cette étape.",
    helpGuidance:
      "Donne 2-3 exemples listant les objets et outils 3D nécessaires (ex: « Roue de secours (jante + pneu), 5 écrous métalliques, clé dynamométrique, moyeu de roue avec goujons »).",
    validationExpected:
      "Une liste ou description d'objets, pièces, outils ou assets 3D.",
  },
  ui: {
    label: "l'interface utilisateur (UI)",
    description:
      "Éléments visuels d'interface 2D/3D affichés à l'écran (overlays, jauges, compteurs, tooltips, messages, boutons).",
    questionPrompt:
      "Demande quels éléments graphiques d'interface utilisateur (UI) sont affichés à l'écran pour guider ou informer le participant (overlays de guidage, compteurs, jauges de couple, tooltips, messages textuels, boutons).",
    helpGuidance:
      "Donne 2-3 exemples STRICTEMENT composés d'éléments d'interface graphique (UI) (ex: « Overlay 3D avec schéma de serrage en étoile numéroté (1-3-5-2-4) », « Compteur d'écrous serrés (X/5) et jauge de couple », « Tooltip au survol de la clé + message de guidage 'Serrer en croix' »). ATTENTION: Ne donne JAMAIS de gestes physiques ou de consignes d'atelier.",
    validationExpected:
      "Des éléments graphiques d'interface UI (overlays, jauges, compteurs, tooltips, messages textuels, boutons d'interaction).",
  },
  animations: {
    label: "les animations / effets visuels (VFX) et sons",
    description:
      "Animations des objets, effets visuels (particules, reflets, surbrillance) et effets sonores.",
    questionPrompt:
      "Demande quelles animations 3D, effets visuels (particules, surbrillance/highlight) ou retours sonores et haptiques accompagnent cette étape.",
    helpGuidance:
      "Donne 2-3 exemples d'animations 3D, VFX et effets sonores (ex: « Animation de vissage fluide, surbrillance (highlight) sur le goujon ciblé, son mécanique de cliquet 'clac-clac', vibration haptique dans la manette au serrage final »).",
    validationExpected:
      "Des animations 3D, effets visuels (particules, surbrillance), retours sonores ou vibrations haptiques.",
  },
  validation: {
    label: "la règle de validation et le feedback",
    description:
      "Condition technique qui valide l'étape et feedback renvoyé en cas de succès ou d'erreur.",
    questionPrompt:
      "Demande quelle règle ou déclencheur valide cette étape et quel message/feedback (succès ou erreur) est envoyé au participant.",
    helpGuidance:
      "Donne 2-3 exemples de règles de validation avec leur feedback (ex: « Validé quand les 5 écrous sont serrés au couple requis. Si ordre incorrect : message d'avertissement 'Respecter le schéma en étoile' en rouge pendant 3s »).",
    validationExpected:
      "Une condition de réussite/validation et le feedback associé (succès/erreur).",
  },
};

const STEP_FIELD_LABELS: Record<string, string> = {
  titre: STEP_FIELD_SPECS.titre.label,
  action: STEP_FIELD_SPECS.action.label,
  resultat: STEP_FIELD_SPECS.resultat.label,
  objets3d: STEP_FIELD_SPECS.objets3d.label,
  ui: STEP_FIELD_SPECS.ui.label,
  animations: STEP_FIELD_SPECS.animations.label,
  validation: STEP_FIELD_SPECS.validation.label,
  statut: "le statut (À faire / En cours / Ready for Testing / Terminé)",
};

const STEP_FIELD_CONTEXT: Record<string, string> = {
  titre: STEP_FIELD_SPECS.titre.description,
  action: STEP_FIELD_SPECS.action.description,
  resultat: STEP_FIELD_SPECS.resultat.description,
  objets3d: STEP_FIELD_SPECS.objets3d.description,
  ui: STEP_FIELD_SPECS.ui.description,
  animations: STEP_FIELD_SPECS.animations.description,
  validation: STEP_FIELD_SPECS.validation.description,
};

function getScenarioSteps(scenario: any): any[] {
  if (
    scenario.answers &&
    typeof scenario.answers === "object" &&
    !Array.isArray(scenario.answers) &&
    Array.isArray(scenario.answers.steps)
  ) {
    return scenario.answers.steps;
  }
  return [];
}

function persistScenario(project: any) {
  project.markModified("scenarios");
  return project.save();
}

function newStepRow(numero: string): any {
  return {
    numero,
    titre: "",
    action: "",
    resultat: "",
    objets3d: "",
    ui: "",
    animations: "",
    validation: "",
    statut: "À faire",
    chatHistory: [],
  };
}

function getScenarioFieldSpec(
  fieldKey: string,
  dbFields?: IScenarioField[],
) {
  const fallback = STEP_FIELD_SPECS[fieldKey] || {
    label: fieldKey,
    description: "",
    questionPrompt: `Demande « ${fieldKey} » pour cette étape.`,
    helpGuidance: "",
    validationExpected: "Une information concrète pour ce champ.",
    forbidden: "",
  };

  const fromDb = dbFields?.find(
    (f) =>
      (f.key && f.key.trim().toLowerCase() === fieldKey.trim().toLowerCase()) ||
      f.label.trim().toLowerCase() === fieldKey.trim().toLowerCase(),
  );

  if (fromDb) {
    return {
      label: fromDb.label,
      description: fromDb.description || fallback.description,
      questionPrompt: fallback.questionPrompt,
      helpGuidance: fromDb.description || fallback.helpGuidance,
      validationExpected: fromDb.description || fallback.validationExpected,
      forbidden: fromDb.forbidden || (fallback as any).forbidden || "",
    };
  }

  return { ...fallback, forbidden: (fallback as any).forbidden || "" };
}

function nextMissingFieldKey(
  step: any,
  dbFields?: IScenarioField[],
): string | null {
  if (dbFields && dbFields.length > 0) {
    for (const f of dbFields) {
      const k = f.key || f.label.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const v = step?.[k];
      if (!v || !String(v).trim()) return k;
    }
    return null;
  }
  for (const { key } of STEP_ASK_KEYS) {
    const v = step?.[key];
    if (!v || !String(v).trim()) return key;
  }
  return null;
}

function stepSummarized(step: any, dbFields?: IScenarioField[]): string {
  const keys =
    dbFields && dbFields.length > 0
      ? dbFields.map((f) => f.key || f.label.toLowerCase().replace(/[^a-z0-9]/g, "_"))
      : (STEP_ALL_KEYS as readonly string[]);

  const lines = keys.map((k) => {
    const spec = getScenarioFieldSpec(k, dbFields);
    const label = (spec.label || k)
      .replace(/^l['’]/, "")
      .replace(/^(le |la |les )/, "");
    const cap = label.charAt(0).toUpperCase() + label.slice(1);
    return `• **${cap}** : ${String(step?.[k] || "—").trim()}`;
  });
  return lines.join("\n");
}

function buildStepRecap(
  scenarioName: string,
  stepIndex: number,
  step: any,
  dbFields?: IScenarioField[],
): string {
  const num = stepIndex + 1;
  const titre = String(step?.titre || "").trim();
  return `**Étape ${num}${titre ? ` — ${titre}` : ""}** complétée ✓\n\n${stepSummarized(step, dbFields)}\n\nPour modifier une valeur, tapez par exemple : « Modifie **l'action gestuelle** : ... », ou la nouvelle valeur directement.`;
}

function buildStepQuestionPrompt(
  fieldKey: string,
  scenarioName: string,
  stepIndex: number,
  step: any,
  projectAnswers: Record<string, any>,
  dbFields?: IScenarioField[],
): string {
  const spec = getScenarioFieldSpec(fieldKey, dbFields);
  const stepTitre = step?.titre ? String(step.titre).trim() : "";

  const context = Object.entries(projectAnswers || {})
    .filter(
      ([k, v]) =>
        k !== "scenes" &&
        v &&
        (typeof v === "string"
          ? v.trim()
          : Array.isArray(v)
            ? v.length > 0
            : true),
    )
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  const knownFields = Object.entries(step || {})
    .filter(
      ([k, v]) =>
        k !== "chatHistory" &&
        k !== "numero" &&
        k !== "statut" &&
        v &&
        String(v).trim(),
    )
    .map(([k, v]) => `- ${getScenarioFieldSpec(k, dbFields).label || k} : ${v}`)
    .join("\n");

  return `Tu es Tadreex Creator, assistant de conception VR pédagogique.
Tu définis les détails de l'Étape n°${stepIndex + 1}${stepTitre ? ` : « ${stepTitre} »` : ""} pour le scénario « ${scenarioName} ».

${context ? `Contexte général de la formation :\n${context}\n` : ""}
${knownFields ? `Informations déjà définies pour CETTE étape (${stepTitre || `Étape ${stepIndex + 1}`}) :\n${knownFields}\n` : ""}

Champ à renseigner : **${spec.label}**
Ce qui est attendu pour ce champ : ${spec.description}

RÈGLES STRICTES :
- Pose UNE seule question concise (max 2 phrases).
- La question et l'exemple DOIVENT porter directement sur l'étape « ${stepTitre || `Étape ${stepIndex + 1}`} » et sur la nature précise du champ demandé (${spec.label}).
- Utilise **gras** uniquement sur le mot-clé principal.
- Pas de préambule, pas de salutation.
- Ne parle PAS des autres champs.`;
}

function buildStepSuggestionsPrompt(
  fieldKey: string,
  scenarioName: string,
  stepIndex: number,
  step: any,
  projectAnswers?: Record<string, any>,
  dbFields?: IScenarioField[],
): string {
  const spec = getScenarioFieldSpec(fieldKey, dbFields);
  const stepTitre = step?.titre ? String(step.titre).trim() : "";
  let projectContext = "";
  if (projectAnswers) {
    const relevant = Object.entries(projectAnswers)
      .filter(
        ([k, v]) =>
          k !== "scenes" &&
          v &&
          (typeof v === "string" ? v.trim() : Array.isArray(v) ? v.length > 0 : true),
      )
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    if (relevant) projectContext = `\nContexte de la formation :\n${relevant}\n`;
  }

  const knownFields = Object.entries(step || {})
    .filter(
      ([k, v]) =>
        k !== "chatHistory" &&
        k !== "numero" &&
        k !== "statut" &&
        v &&
        String(v).trim(),
    )
    .map(([k, v]) => `- ${getScenarioFieldSpec(k, dbFields).label || k} : ${v}`)
    .join("\n");

  return `Tu proposes des réponses toutes prêtes (suggestions) à l'utilisateur pour renseigner le champ « ${spec.label} » de l'Étape n°${stepIndex + 1}${stepTitre ? ` (« ${stepTitre} »)` : ""} du scénario « ${scenarioName} ».
${projectContext}
${knownFields ? `Informations déjà définies pour cette étape :\n${knownFields}\n` : ""}

Type d'informations attendues pour ce champ : ${spec.description}
${spec.forbidden ? `ATTENTION INTERDIT DANS CE CHAMP : ${spec.forbidden}\n` : ""}

CHAQUE suggestion doit :
- Être directement utilisable telle quelle comme LA réponse du participant pour « ${spec.label} » (pas de tiret, pas de liste à puces, pas de mise en forme markdown)
- Être STRICTEMENT conforme à « ${spec.label} » (attendu : ${spec.description}) et au sujet de cette étape (${stepTitre || `Étape ${stepIndex + 1}`})
- Varier les approches (2-3 suggestions différentes mais toutes valides)
- Être concise (1 à 2 lignes max) et en français correct${spec.forbidden ? `\n- NE PAS PORTER SUR : ${spec.forbidden}.` : ""}`;
}

function stepResponse(
  project: any,
  scenario: any,
  botMessage: string,
  stepComplete: boolean,
): Record<string, any> {
  return {
    scenarios: project.scenarios,
    botMessage,
    stepComplete,
    done: scenario.builder?.state === "done",
    inputDisabled: false,
  };
}

async function validateStepField(
  fieldKey: string,
  msg: string,
  projectAnswers?: Record<string, any>,
  step?: any,
  stepIndex?: number,
  dbFields?: IScenarioField[],
): Promise<{ value: string; isValid: boolean; reason: string }> {
  const spec = getScenarioFieldSpec(fieldKey, dbFields);
  const stepTitre = step?.titre ? String(step.titre).trim() : "";

  let projectContext = "";
  if (projectAnswers) {
    const relevant = Object.entries(projectAnswers)
      .filter(
        ([k, v]) =>
          k !== "scenes" &&
          v &&
          (typeof v === "string" ? v.trim() : Array.isArray(v) ? v.length > 0 : true),
      )
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    if (relevant) projectContext = `\nContexte global du projet :\n${relevant}\n`;
  }

  const knownFields = Object.entries(step || {})
    .filter(
      ([k, v]) =>
        k !== "chatHistory" &&
        k !== "numero" &&
        k !== "statut" &&
        k !== fieldKey &&
        v &&
        String(v).trim(),
    )
    .map(([k, v]) => `- ${getScenarioFieldSpec(k, dbFields).label || k} : ${v}`)
    .join("\n");

  const r = await getStrongLlm()
    .withStructuredOutput(stepFieldSchema)
    .invoke([
      {
        role: "system",
        content: `Tu valides la réponse utilisateur pour le champ « ${spec.label} » de l'étape ${stepIndex !== undefined ? `n°${stepIndex + 1}` : ""}${stepTitre ? ` (« ${stepTitre} »)` : ""} d'un scénario VR (Tadreex).

Ce qui est attendu pour ce champ : ${spec.description}
${spec.forbidden ? `Ce qui est hors-sujet / interdit : ${spec.forbidden}\n` : ""}
${projectContext}
${knownFields ? `Détails déjà validés pour cette étape :\n${knownFields}\n` : ""}

RÈGLES DE VALIDATION :
- isValid = true si la réponse contient une information sérieuse et cohérente avec « ${spec.label} » (${spec.description}) pour cette étape (${stepTitre || "cette étape"}).
- isValid = false si :
  1. La réponse est du charabia / incompréhensible (ex: "zugedzjedbzd"), une blague ou injure.
  2. La réponse décrit une tout autre catégorie${spec.forbidden ? ` (par exemple : ${spec.forbidden})` : ""}.
- value : réécris l'information proprement en français, sans mise en forme markdown ni puces.
- reason : si invalide, explique brièvement en français ce qui manque ou ce qui est attendu (ex: « Veuillez indiquer : ${spec.description} »).`,
      },
      { role: "user", content: msg },
    ]);
  return { value: r.value, isValid: r.isValid, reason: r.reason };
}

async function askStepField(
  fieldKey: string,
  scenarioName: string,
  stepIndex: number,
  step: any,
  projectAnswers: Record<string, any>,
): Promise<string> {
  const dbFields = await getActiveScenarioFields();
  const prompt = buildStepQuestionPrompt(
    fieldKey,
    scenarioName,
    stepIndex,
    step,
    projectAnswers,
    dbFields,
  );
  const response = await getStrongLlm().invoke([
    { role: "system", content: prompt },
  ]);
  return response.content.toString().trim();
}

async function sendStepSuggestions(
  fieldKey: string,
  scenarioName: string,
  stepIndex: number,
  step: any,
  projectAnswers?: Record<string, any>,
): Promise<string[]> {
  const dbFields = await getActiveScenarioFields();
  const prompt = buildStepSuggestionsPrompt(
    fieldKey,
    scenarioName,
    stepIndex,
    step,
    projectAnswers,
    dbFields,
  );
  const r = await getStrongLlm()
    .withStructuredOutput(suggestionsSchema)
    .invoke([{ role: "system", content: prompt }]);
  return r.suggestions || [];
}

async function initStepChat(
  project: any,
  scenario: any,
  stepIndex: number,
): Promise<Record<string, any>> {
  const dbFields = await getActiveScenarioFields();
  const steps = getScenarioSteps(scenario);
  const step = steps[stepIndex];
  const missing = nextMissingFieldKey(step, dbFields);
  if (!Array.isArray(step.chatHistory)) step.chatHistory = [];
  let botMessage: string;
  const lastBot = step.chatHistory.length
    ? [...step.chatHistory].reverse().find((m) => m.role === "bot")
    : undefined;
  if (lastBot) {
    botMessage = lastBot.content;
  } else if (missing) {
    botMessage = await askStepField(
      missing,
      scenario.name,
      stepIndex,
      step,
      project.answers,
    );
    step.chatHistory.push({ role: "bot", content: botMessage });
  } else {
    botMessage = buildStepRecap(scenario.name, stepIndex, step, dbFields);
    step.chatHistory.push({ role: "bot", content: botMessage });
  }
  await persistScenario(project);
  return stepResponse(project, scenario, botMessage, !missing);
}

async function handleStepHelp(
  project: any,
  scenario: any,
  stepIndex: number,
): Promise<Record<string, any>> {
  const dbFields = await getActiveScenarioFields();
  const steps = getScenarioSteps(scenario);
  const step = steps[stepIndex];
  const missing = nextMissingFieldKey(step, dbFields);
  let botMessage: string;
  let suggestions: string[] = [];
  if (missing) {
    const spec = getScenarioFieldSpec(missing, dbFields);
    suggestions = await sendStepSuggestions(
      missing,
      scenario.name,
      stepIndex,
      step,
      project.answers,
    );
    botMessage =
      suggestions.length > 0
        ? `Voici quelques suggestions pour **${spec.label}**. Sélectionnez-en une ou plusieurs, modifiez-les si besoin, puis validez.`
        : `Je n'ai pas trouvé de suggestions pour « ${spec.label} ». Décrivez directement ${spec.label} de cette étape.`;
  } else {
    botMessage = buildStepRecap(scenario.name, stepIndex, step, dbFields);
  }
  if (!Array.isArray(step.chatHistory)) step.chatHistory = [];
  step.chatHistory.push(
    { role: "user", content: "[Aide]" },
    { role: "bot", content: botMessage },
  );
  await persistScenario(project);
  return {
    ...stepResponse(project, scenario, botMessage, !missing),
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
}

async function applyStepModify(
  project: any,
  scenario: any,
  stepIndex: number,
  msg: string,
): Promise<Record<string, any>> {
  const dbFields = await getActiveScenarioFields();
  const steps = getScenarioSteps(scenario);
  const step = steps[stepIndex];
  const r = await getStrongLlm()
    .withStructuredOutput(stepModifySchema)
    .invoke([
      {
        role: "system",
        content: `L'utilisateur veut modifier une ou plusieurs valeurs de cette étape de scénario VR :
${JSON.stringify(step, null, 2)}
Champs possibles : ${(STEP_ALL_KEYS as readonly string[]).join(", ")}.
Extrais de son message UNIQUEMENT les valeurs clairement fournies, en les corrigeant en français correct.`,
      },
      { role: "user", content: msg },
    ]);

  const updates = r.updates;
  if (updates && typeof updates === "object" && Object.keys(updates).length > 0) {
    for (const k of STEP_ALL_KEYS) {
      const v = updates[k];
      if (typeof v === "string" && v.trim()) step[k] = v.trim();
    }
    const botMessage = `Valeurs mises à jour ✓\n\n${buildStepRecap(scenario.name, stepIndex, step, dbFields)}`;
    step.chatHistory.push(
      { role: "user", content: msg },
      { role: "bot", content: botMessage },
    );
    await persistScenario(project);
    return stepResponse(project, scenario, botMessage, true);
  }

  const botMessage = `Je n'ai pas identifié de valeur à modifier. Dites par exemple : « Modifie **l'action gestuelle** : prendre les gants puis les enfiler ».\n\n${buildStepRecap(scenario.name, stepIndex, step, dbFields)}`;
  step.chatHistory.push(
    { role: "user", content: msg },
    { role: "bot", content: botMessage },
  );
  await persistScenario(project);
  return stepResponse(project, scenario, botMessage, true);
}

async function processStepAnswer(
  project: any,
  scenario: any,
  stepIndex: number,
  msg: string,
): Promise<Record<string, any>> {
  const dbFields = await getActiveScenarioFields();
  const steps = getScenarioSteps(scenario);
  const step = steps[stepIndex];
  if (!step) {
    return stepResponse(project, scenario, "Cette étape n'existe plus.", false);
  }
  if (!Array.isArray(step.chatHistory)) step.chatHistory = [];

  const missing = nextMissingFieldKey(step, dbFields);

  // Guided answer: the message answers the current pending field.
  if (missing) {
    const r = await validateStepField(
      missing,
      msg,
      project.answers,
      step,
      stepIndex,
      dbFields,
    );
    if (!r.isValid) {
      const reason = r.reason || "La réponse n'est pas exploitable pour ce champ.";
      const reask = await askStepField(
        missing,
        scenario.name,
        stepIndex,
        step,
        project.answers,
      );
      const botMessage = `${reason}\n\n${reask}`;
      step.chatHistory.push(
        { role: "user", content: msg },
        { role: "bot", content: botMessage },
      );
      await persistScenario(project);
      return stepResponse(project, scenario, botMessage, false);
    }
    step[missing] = r.value;
    const nextMissing = nextMissingFieldKey(step, dbFields);
    let botMessage: string;
    let complete: boolean;
    if (nextMissing) {
      const q = await askStepField(
        nextMissing,
        scenario.name,
        stepIndex,
        step,
        project.answers,
      );
      botMessage = `✓ Enregistré.\n\n${q}`;
      complete = false;
    } else {
      botMessage = buildStepRecap(scenario.name, stepIndex, step, dbFields);
      complete = true;
    }
    step.chatHistory.push(
      { role: "user", content: msg },
      { role: "bot", content: botMessage },
    );
    await persistScenario(project);
    return stepResponse(project, scenario, botMessage, complete);
  }

  // Step complete — the user may modify one or more values.
  return applyStepModify(project, scenario, stepIndex, msg);
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
  field: IChatField | { type?: string; options?: string[] },
): string[] | null {
  if (
    (field.type === "radio" || field.type === "checkbox") &&
    field.options &&
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
      if (project.scenarios.length === 0) {
        project.scenarios.push({
          name: "Scénario 1",
          currentField: 0,
          chatHistory: [],
          answers: {},
          builder: { state: "collecting" },
        });
      }
      await project.save();
      respond(res, {
        phase: "scenario",
        answers: project.answers,
        scenarios: project.scenarios,
        scenarioFields: [],
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

    if (userMessage === "__back_to_review__") {
      project.phase = "review";
      await project.save();
      respond(res, { phase: "review", answers: project.answers });
      return;
    }

    if (userMessage === "__reset__") {
      project.phase = "info";
      project.status = "draft";
      project.currentStep = 0;
      project.answers = { scenes: [] };
      project.infoChatHistory = [];
      project.scenarios = [];
      await project.save();
      respond(res, { phase: "info", reset: true });
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

// ─── Scenario Step Chat Handler ────────────────────────────────────────────────

export const handleStepMessage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token, scenarioIndex, stepIndex } = req.params;
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

    const sIdx = parseInt(scenarioIndex, 10);
    const stIdx = parseInt(stepIndex, 10);
    if (
      isNaN(sIdx) ||
      sIdx < 0 ||
      sIdx >= project.scenarios.length ||
      isNaN(stIdx) ||
      stIdx < 0
    ) {
      res.status(400).json({ message: "Index invalide." });
      return;
    }

    const scenario = project.scenarios[sIdx] as any;
    const steps = getScenarioSteps(scenario);
    if (stIdx >= steps.length) {
      res
        .status(400)
        .json({ message: "Étape introuvable. Ajoutez d'abord une étape." });
      return;
    }

    let result: Record<string, any>;
    if (userMessage === "__init__") {
      result = await initStepChat(project, scenario, stIdx);
    } else if (userMessage === "__help__") {
      result = await handleStepHelp(project, scenario, stIdx);
    } else {
      result = await processStepAnswer(project, scenario, stIdx, userMessage);
    }

    respond(res, result);
  } catch (err) {
    console.error("Step error:", err);
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
      builder: { state: "collecting" },
    });
    project.markModified("scenarios");
    await project.save();
    respond(res, { scenarios: project.scenarios });
  } catch (err) {
    console.error("Error adding scenario:", err);
    res.status(500).json({ message: "Erreur ajout scénario." });
  }
};

export const renameScenarioBlock = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token, scenarioIndex } = req.params;
    const { name } = req.body;
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
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName) {
      res.status(400).json({ message: "Le nom du scénario est requis." });
      return;
    }
    project.scenarios[idx].name = cleanName;
    project.markModified("scenarios");
    await project.save();
    respond(res, { scenarios: project.scenarios });
  } catch (err) {
    console.error("Error renaming scenario:", err);
    res.status(500).json({ message: "Erreur renommage." });
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
      scenarioFields: [],
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur." });
  }
};

export const addScenarioStepBlock = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token, scenarioIndex } = req.params;
    const sIdx = parseInt(scenarioIndex, 10);
    const project = await Project.findOne({ clientToken: token });
    if (!project) {
      res.status(404).json({ message: "Projet introuvable" });
      return;
    }
    if (isNaN(sIdx) || sIdx < 0 || sIdx >= project.scenarios.length) {
      res.status(400).json({ message: "Index de scénario invalide." });
      return;
    }
    const scenario = project.scenarios[sIdx] as any;
    if (
      !scenario.answers ||
      typeof scenario.answers !== "object" ||
      Array.isArray(scenario.answers)
    ) {
      scenario.answers = {};
    }
    if (!Array.isArray(scenario.answers.steps)) {
      scenario.answers.steps = [];
    }
    const maxNum = scenario.answers.steps.reduce(
      (m: number, s: any) => Math.max(m, parseFloat(s?.numero) || 0),
      0,
    );
    scenario.answers.steps.push(newStepRow(String(maxNum + 1)));
    scenario.builder = { state: "collecting" };
    await persistScenario(project);
    respond(res, {
      scenarios: project.scenarios,
      stepIndex: scenario.answers.steps.length - 1,
    });
  } catch (err) {
    console.error("Error adding step:", err);
    res.status(500).json({ message: "Erreur ajout étape." });
  }
};

export const deleteScenarioStepBlock = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token, scenarioIndex, stepIndex } = req.params;
    const sIdx = parseInt(scenarioIndex, 10);
    const stIdx = parseInt(stepIndex, 10);
    const project = await Project.findOne({ clientToken: token });
    if (!project) {
      res.status(404).json({ message: "Projet introuvable" });
      return;
    }
    if (
      isNaN(sIdx) ||
      sIdx < 0 ||
      sIdx >= project.scenarios.length ||
      isNaN(stIdx) ||
      stIdx < 0
    ) {
      res.status(400).json({ message: "Index invalide." });
      return;
    }
    const scenario = project.scenarios[sIdx] as any;
    const steps = getScenarioSteps(scenario);
    if (stIdx >= steps.length) {
      res.status(400).json({ message: "Étape introuvable." });
      return;
    }
    steps.splice(stIdx, 1);
    scenario.builder = scenario.builder || {};
    scenario.builder.state = "collecting";
    await persistScenario(project);
    respond(res, { scenarios: project.scenarios });
  } catch (err) {
    console.error("Error deleting step:", err);
    res.status(500).json({ message: "Erreur suppression étape." });
  }
};

export const finalizeScenarioBlock = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token, scenarioIndex } = req.params;
    const sIdx = parseInt(scenarioIndex, 10);
    const project = await Project.findOne({ clientToken: token });
    if (!project) {
      res.status(404).json({ message: "Projet introuvable" });
      return;
    }
    if (isNaN(sIdx) || sIdx < 0 || sIdx >= project.scenarios.length) {
      res.status(400).json({ message: "Index de scénario invalide." });
      return;
    }
    const scenario = project.scenarios[sIdx] as any;
    scenario.builder = { state: "done" };
    await persistScenario(project);
    respond(res, { scenarios: project.scenarios, done: true });
  } catch (err) {
    console.error("Error finalizing scenario:", err);
    res.status(500).json({ message: "Erreur finalisation." });
  }
};
