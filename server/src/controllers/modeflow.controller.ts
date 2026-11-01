import { Request, Response } from "express";
import { z } from "zod";
import { findProjectByToken, newScenarioBlock, saveProject, IProject, ProjectPhase } from "../models/Project";
import { IScenarioField, MODE_RANK } from "../models/ScenarioField";
import {
  getActiveScenarioFields,
  getScenarioFieldSpec,
  getScenarioSteps,
  getStrongLlm,
  isRateLimitError,
  formatRateLimitPayload,
  newStepRow,
  sendStepSuggestions,
  validateStepField,
} from "./chatbot.controller";

// Brainstorm -> refine -> final flow, used by projects that have a mode.

const MAX_BRAINSTORM_CHARS = 20_000;

const fieldKey = (f: IScenarioField): string =>
  f.key || f.label.toLowerCase().replace(/[^a-z0-9]/g, "_");

// Fields asked for the project's mode: those whose level is at or below the mode
const fieldsForProject = async (project: IProject): Promise<IScenarioField[]> => {
  const all = await getActiveScenarioFields();
  const rank = MODE_RANK[project.mode as keyof typeof MODE_RANK] ?? 2;
  return all.filter((f) => (MODE_RANK[f.level] ?? 2) <= rank);
};

interface Missing {
  scenarioIndex: number;
  stepIndex: number;
  key: string;
  label: string;
  scenarioName: string;
  stepTitle: string;
}

const missingFor = (project: IProject, fields: IScenarioField[]): Missing[] => {
  const out: Missing[] = [];
  project.scenarios.forEach((sc: any, si) => {
    getScenarioSteps(sc).forEach((step, sti) => {
      for (const f of fields) {
        const k = fieldKey(f);
        const v = step?.[k];
        if (!v || !String(v).trim()) {
          out.push({
            scenarioIndex: si,
            stepIndex: sti,
            key: k,
            label: f.label,
            scenarioName: sc.name,
            stepTitle: String(step?.titre || "").trim(),
          });
        }
      }
    });
  });
  return out;
};

const statePayload = (project: IProject, fields: IScenarioField[]) => ({
  phase: project.phase,
  mode: project.mode,
  brainstormText: project.brainstormText,
  scenarios: project.scenarios,
  fields: fields.map((f) => ({ key: fieldKey(f), label: f.label })),
  missing: missingFor(project, fields),
});

const fail = (res: Response, err: any, prefix: string, fallback: string) => {
  console.error(`${prefix}:`, err);
  if (isRateLimitError(err)) {
    res.status(429).json(formatRateLimitPayload(prefix, err));
    return;
  }
  res.status(500).json({ message: fallback });
};

// Loads the project and checks it is a mode project in one of the allowed phases
const loadModeProject = async (
  req: Request,
  res: Response,
  phases: ProjectPhase[],
): Promise<IProject | null> => {
  const project = await findProjectByToken(req.params.token);
  if (!project) {
    res.status(404).json({ message: "Projet introuvable" });
    return null;
  }
  if (!project.mode) {
    res.status(400).json({ message: "Ce projet n'utilise pas les modes." });
    return null;
  }
  if (!phases.includes(project.phase)) {
    res.status(400).json({ message: "Action impossible à cette étape." });
    return null;
  }
  return project;
};

const locateStep = (project: IProject, scenarioIndex: unknown, stepIndex: unknown) => {
  if (!Number.isInteger(scenarioIndex) || !Number.isInteger(stepIndex)) return null;
  const scenario = project.scenarios[scenarioIndex as number] as any;
  if (!scenario) return null;
  const step = getScenarioSteps(scenario)[stepIndex as number];
  return step ? { scenario, step } : null;
};

// GET /:token/mode — current structure and gaps (used to resume)
export const getModeState = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await findProjectByToken(req.params.token);
    if (!project) {
      res.status(404).json({ message: "Projet introuvable" });
      return;
    }
    res.json(statePayload(project, await fieldsForProject(project)));
  } catch (err) {
    fail(res, err, "Mode state error", "Erreur. Réessayez.");
  }
};

// POST /:token/brainstorm { text } — extract the structure from the free text
export const submitBrainstorm = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await loadModeProject(req, res, ["brainstorm"]);
    if (!project) return;

    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ message: "Décrivez votre scénario avant de continuer." });
      return;
    }
    if (text.length > MAX_BRAINSTORM_CHARS) {
      res.status(413).json({ message: "Texte trop long (20 000 caractères maximum)." });
      return;
    }

    const fields = await fieldsForProject(project);
    const stepShape: Record<string, z.ZodString> = {};
    for (const f of fields) {
      const spec = getScenarioFieldSpec(fieldKey(f), fields);
      stepShape[fieldKey(f)] = z
        .string()
        .describe(
          `${spec.label} : ${spec.description}${spec.forbidden ? ` (hors-sujet : ${spec.forbidden})` : ""}. Chaîne vide si l'utilisateur ne l'a pas dit.`,
        );
    }
    const schema = z.object({
      scenarios: z.array(
        z.object({
          name: z.string().describe("Nom court du scénario"),
          steps: z.array(z.object(stepShape)).describe("Étapes du scénario dans l'ordre"),
        }),
      ),
    });

    const context = Object.entries(project.answers || {})
      .filter(([k, v]) => k !== "scenes" && v && (typeof v === "string" ? v.trim() : Array.isArray(v) ? v.length > 0 : false))
      .slice(0, 6)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");

    const r = await getStrongLlm()
      .withStructuredOutput(schema)
      .invoke([
        {
          role: "system",
          content: `Tu structures le texte libre d'un client qui décrit des scénarios de formation en réalité virtuelle (Tadreex).
${context ? `Contexte de la formation :\n${context}\n` : ""}
RÈGLES STRICTES :
- Découpe le texte en scénarios, puis en étapes dans l'ordre où le client les décrit.
- Pour chaque étape, remplis uniquement les champs que le client a réellement mentionnés, en français correct, sans mise en forme.
- N'INVENTE RIEN : si une information n'est pas dans le texte, laisse la chaîne vide "".
- Respecte la nature de chaque champ ; ne mets pas une information dans un champ qui n'est pas le sien.
- Exception pour le champ « titre » : si le client ne donne pas de titre, déduis un titre court (3 à 6 mots) à partir de la description de l'étape.
- Si le texte ne décrit aucun scénario exploitable, renvoie une liste de scénarios vide.`,
        },
        { role: "user", content: text },
      ]);

    const extracted = (r.scenarios || []).filter((s) => Array.isArray(s.steps) && s.steps.length > 0);
    if (extracted.length === 0) {
      res.status(422).json({
        message: "Aucun scénario détecté. Décrivez au moins un scénario et ses étapes.",
      });
      return;
    }

    project.brainstormText = text;
    project.scenarios = extracted.map((s, i) => {
      const block: any = newScenarioBlock(s.name?.trim() || `Scénario ${i + 1}`);
      block.answers = {
        steps: s.steps.map((raw, n) => {
          const row = newStepRow(String(n + 1));
          for (const f of fields) {
            const v = (raw as Record<string, unknown>)[fieldKey(f)];
            if (typeof v === "string" && v.trim()) row[fieldKey(f)] = v.trim();
          }
          return row;
        }),
      };
      return block;
    });
    project.phase = "refine";
    await saveProject(project);
    res.json(statePayload(project, fields));
  } catch (err) {
    fail(res, err, "Brainstorm error", "Erreur lors de l'analyse. Réessayez.");
  }
};

// POST /:token/refine/fix { scenarioIndex, stepIndex, key, value }
export const fixField = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await loadModeProject(req, res, ["refine"]);
    if (!project) return;
    const { scenarioIndex, stepIndex, key, value } = req.body;
    const fields = await fieldsForProject(project);
    const found = locateStep(project, scenarioIndex, stepIndex);
    if (!found || !fields.some((f) => fieldKey(f) === key) || typeof value !== "string" || !value.trim()) {
      res.status(400).json({ message: "Requête invalide." });
      return;
    }

    const r = await validateStepField(key, value.trim(), project.answers, found.step, stepIndex, fields);
    if (!r.isValid) {
      res.status(422).json({ message: r.reason || "La réponse n'est pas exploitable pour ce champ." });
      return;
    }
    found.step[key] = r.value;
    await saveProject(project);
    res.json(statePayload(project, fields));
  } catch (err) {
    fail(res, err, "Fix error", "Erreur. Réessayez.");
  }
};

// POST /:token/refine/suggest { scenarioIndex, stepIndex, key }
export const suggestField = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await loadModeProject(req, res, ["refine"]);
    if (!project) return;
    const { scenarioIndex, stepIndex, key } = req.body;
    const fields = await fieldsForProject(project);
    const found = locateStep(project, scenarioIndex, stepIndex);
    if (!found || !fields.some((f) => fieldKey(f) === key)) {
      res.status(400).json({ message: "Requête invalide." });
      return;
    }
    const suggestions = await sendStepSuggestions(key, found.scenario.name, stepIndex, found.step, project.answers);
    res.json({ suggestions });
  } catch (err) {
    fail(res, err, "Suggest error", "Erreur. Réessayez.");
  }
};

const refineChatSchema = z.object({
  edits: z
    .array(
      z.object({
        scenarioNumber: z.number().int().describe("Numéro du scénario, à partir de 1"),
        stepNumber: z.number().int().describe("Numéro de l'étape dans le scénario, à partir de 1"),
        key: z.string().describe("Clé du champ à modifier"),
        value: z.string().describe("Nouvelle valeur, en français correct"),
      }),
    )
    .describe("Modifications de champs clairement demandées ; liste vide sinon"),
  operations: z
    .array(
      z.object({
        type: z.enum(["add_scenario", "delete_scenario", "rename_scenario", "add_step", "delete_step"]),
        scenarioNumber: z
          .number()
          .int()
          .nullable()
          .describe("Scénario visé (à partir de 1) ; null pour add_scenario"),
        stepNumber: z
          .number()
          .int()
          .nullable()
          .describe("delete_step : étape à supprimer. add_step : position d'insertion (null = à la fin)"),
        name: z.string().nullable().describe("add_scenario / rename_scenario : nom du scénario"),
        values: z
          .array(z.object({ key: z.string(), value: z.string() }))
          .describe("add_step : valeurs connues des champs (clé, valeur), uniquement celles dites par l'utilisateur ; liste vide sinon"),
      }),
    )
    .describe("Ajouts, suppressions ou renommages de scénarios et d'étapes demandés ; liste vide sinon"),
  message: z.string().describe("Confirmation courte de ce qui a été fait, ou question de clarification, en français"),
});

// POST /:token/refine/chat { message } — natural-language edits from the side chat
export const refineChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await loadModeProject(req, res, ["refine"]);
    if (!project) return;
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      res.status(400).json({ message: "Message vide." });
      return;
    }
    const fields = await fieldsForProject(project);
    const snapshot = project.scenarios.map((sc: any, si) => ({
      scenarioNumber: si + 1,
      name: sc.name,
      steps: getScenarioSteps(sc).map((s, sti) => {
        const { chatHistory, numero, statut, ...rest } = s;
        return { stepNumber: sti + 1, ...rest };
      }),
    }));

    const r = await getStrongLlm()
      .withStructuredOutput(refineChatSchema)
      .invoke([
        {
          role: "system",
          content: `L'utilisateur relit la structure de son scénario VR et demande des modifications.
Structure actuelle (numéros à partir de 1, comme les voit l'utilisateur) :
${JSON.stringify(snapshot, null, 2)}
Champs : ${fields.map((f) => `${fieldKey(f)} (${f.label})`).join(", ")}.

Tu peux :
- "edits" : modifier la valeur d'un champ (numéros de la structure actuelle).
- "operations" : ajouter/supprimer/renommer un scénario, ajouter/supprimer une étape. Les opérations sont appliquées dans l'ordre : les numéros de chaque opération se rapportent à la structure obtenue après les opérations précédentes de la liste (ex. pour ajouter un scénario puis une étape dedans, le nouveau scénario porte le numéro suivant le dernier).
- Pour ajouter une étape, ne mets dans "values" que ce que l'utilisateur a dit ; n'invente rien, les champs vides seront demandés ensuite.
Renvoie uniquement ce qui est clairement demandé. Si la demande est ambiguë ou impossible, laisse les listes vides et pose une question courte dans "message".`,
        },
        { role: "user", content: message },
      ]);

    const allowed = new Set(fields.map(fieldKey));
    const notes: string[] = [];
    let applied = 0;

    for (const e of r.edits || []) {
      const found = locateStep(project, e.scenarioNumber - 1, e.stepNumber - 1);
      if (found && allowed.has(e.key) && e.value.trim()) {
        found.step[e.key] = e.value.trim();
        applied++;
      }
    }

    const cleanValues = (values: { key: string; value: string }[] | null | undefined) => {
      const out: Record<string, string> = {};
      for (const { key, value } of values || []) {
        if (allowed.has(key) && typeof value === "string" && value.trim()) out[key] = value.trim();
      }
      return out;
    };
    const blankStep = (values?: { key: string; value: string }[] | null) => Object.assign(newStepRow("0"), cleanValues(values));

    for (const op of r.operations || []) {
      const si = (op.scenarioNumber ?? 0) - 1;
      const sc = project.scenarios[si] as any;
      if (op.type === "add_scenario") {
        const block: any = newScenarioBlock(op.name?.trim() || `Scénario ${project.scenarios.length + 1}`);
        block.answers = { steps: [] };
        project.scenarios.push(block);
        applied++;
      } else if (!sc) {
        notes.push("scénario introuvable");
      } else if (op.type === "rename_scenario") {
        if (op.name?.trim()) {
          sc.name = op.name.trim();
          applied++;
        }
      } else if (op.type === "delete_scenario") {
        if (project.scenarios.length <= 1) notes.push("il doit rester au moins un scénario");
        else {
          project.scenarios.splice(si, 1);
          applied++;
        }
      } else if (op.type === "add_step") {
        if (!sc.answers || typeof sc.answers !== "object" || Array.isArray(sc.answers)) sc.answers = {};
        if (!Array.isArray(sc.answers.steps)) sc.answers.steps = [];
        const steps = sc.answers.steps;
        const at = op.stepNumber && op.stepNumber >= 1 && op.stepNumber <= steps.length + 1 ? op.stepNumber - 1 : steps.length;
        steps.splice(at, 0, blankStep(op.values));
        applied++;
      } else if (op.type === "delete_step") {
        const steps = getScenarioSteps(sc);
        const sti = (op.stepNumber ?? 0) - 1;
        if (!steps[sti]) notes.push("étape introuvable");
        else if (steps.length <= 1) notes.push("un scénario doit garder au moins une étape");
        else {
          steps.splice(sti, 1);
          applied++;
        }
      }
    }

    // A scenario never stays empty; keep the visible step numbers sequential
    for (const sc of project.scenarios as any[]) {
      if (!sc.answers || typeof sc.answers !== "object" || Array.isArray(sc.answers)) sc.answers = {};
      if (!Array.isArray(sc.answers.steps)) sc.answers.steps = [];
      if (sc.answers.steps.length === 0) sc.answers.steps.push(blankStep());
      getScenarioSteps(sc).forEach((step, i) => {
        step.numero = String(i + 1);
      });
    }

    if (applied > 0) await saveProject(project);
    const botMessage =
      notes.length === 0
        ? r.message
        : applied === 0
          ? `Je n'ai rien modifié : ${notes.join(", ")}.`
          : `${r.message} (Non appliqué : ${notes.join(", ")}.)`;
    res.json({ ...statePayload(project, fields), botMessage, applied });
  } catch (err) {
    fail(res, err, "Refine chat error", "Erreur. Réessayez.");
  }
};

// POST /:token/final — only once nothing is missing
export const goFinal = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await loadModeProject(req, res, ["refine", "final"]);
    if (!project) return;
    const fields = await fieldsForProject(project);
    const missing = missingFor(project, fields);
    if (missing.length > 0) {
      res.status(400).json({ message: "Il reste des informations manquantes.", missing });
      return;
    }
    project.phase = "final";
    await saveProject(project);
    res.json(statePayload(project, fields));
  } catch (err) {
    fail(res, err, "Final error", "Erreur. Réessayez.");
  }
};

// POST /:token/brainstorm/back — return to the text (re-extracting overwrites fixes)
export const backToBrainstorm = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await loadModeProject(req, res, ["refine", "final"]);
    if (!project) return;
    // { to: "refine" } steps back from final without re-running the extraction
    project.phase = req.body?.to === "refine" && project.phase === "final" ? "refine" : "brainstorm";
    await saveProject(project);
    res.json(statePayload(project, await fieldsForProject(project)));
  } catch (err) {
    fail(res, err, "Back error", "Erreur. Réessayez.");
  }
};
