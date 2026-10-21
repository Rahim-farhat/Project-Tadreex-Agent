import { randomInt, randomUUID } from 'crypto';
import { query } from '../config/db';

const TOKEN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const generateToken = (length = 10): string =>
  Array.from({ length }, () => TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]).join('');

export interface IEtape {
  description?: string;
  suggestions?: string;
  ajustements?: string;
}

export interface IScene {
  nom?: string;
  etapes: IEtape[];
}

// Dynamic answers: each chatfield label stores its value here
export interface IAnswers {
  [key: string]: string | string[] | IScene[];
  scenes: IScene[];
}

// A single turn in the chatbot short-term history
export interface IChatTurn {
  role: 'user' | 'bot';
  content: string;
}

// A step row of a scenario built by the smart chatbot (Phase 2)
export interface IStepRow {
  numero: string;
  titre: string;
  action: string;
  resultat: string;
  objets3d: string;
  ui: string;
  animations: string;
  validation: string;
  statut: string;
  chatHistory?: IChatTurn[];
}

// Smart builder state kept on each scenario block
export interface IScenarioBuilder {
  state: 'collecting' | 'done';
  pendingStepIndex?: number | null;
  pendingFields?: string[] | null;
}

// A scenario block within the project (Phase 2)
export interface IScenarioBlock {
  _id: string;
  name: string;
  currentField: number;
  chatHistory: IChatTurn[];
  answers: Record<string, any>;
  builder: IScenarioBuilder;
}

export type ProjectStatus = 'draft' | 'in_progress' | 'completed';
export type ProjectPhase = 'info' | 'review' | 'scenario' | 'completed';

// A project is loaded as a plain object, mutated by the controllers, then
// written back in full with saveProject().
export interface IProject {
  _id: string;
  title: string;
  status: ProjectStatus;
  clientToken: string;
  createdBy?: string | null;
  phase: ProjectPhase;
  currentStep: number;
  infoChatHistory: IChatTurn[];
  answers: IAnswers;
  scenarios: IScenarioBlock[];
  uploadedFiles: string[];
  sheetUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PROJECT_STATUSES: ProjectStatus[] = ['draft', 'in_progress', 'completed'];

const COLUMNS = `id AS "_id", title, status, client_token AS "clientToken", created_by AS "createdBy",
  phase, current_step AS "currentStep", info_chat_history AS "infoChatHistory", answers, scenarios,
  uploaded_files AS "uploadedFiles", sheet_url AS "sheetUrl", created_at AS "createdAt", updated_at AS "updatedAt"`;

export const newScenarioBlock = (name: string): IScenarioBlock => ({
  _id: randomUUID(),
  name,
  currentField: 0,
  chatHistory: [],
  answers: {},
  builder: { state: 'collecting' },
});

export const findProjects = (): Promise<IProject[]> =>
  query<IProject>(`SELECT ${COLUMNS} FROM projects ORDER BY created_at DESC`);

export const findProjectById = async (id: string): Promise<IProject | null> =>
  (await query<IProject>(`SELECT ${COLUMNS} FROM projects WHERE id = $1`, [id]))[0] ?? null;

export const findProjectByToken = async (token: string): Promise<IProject | null> =>
  (await query<IProject>(`SELECT ${COLUMNS} FROM projects WHERE client_token = $1`, [token]))[0] ?? null;

export const createProject = async (title: string, createdBy?: string): Promise<IProject> =>
  (
    await query<IProject>(
      `INSERT INTO projects (title, client_token, created_by) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
      [title.trim(), generateToken(), createdBy ?? null],
    )
  )[0];

export const deleteProjectById = async (id: string): Promise<boolean> =>
  (await query(`DELETE FROM projects WHERE id = $1 RETURNING id`, [id])).length > 0;

export const saveProject = async (p: IProject): Promise<IProject> => {
  const rows = await query<{ updatedAt: Date }>(
    `UPDATE projects SET
       title = $2, status = $3, phase = $4, current_step = $5,
       info_chat_history = $6, answers = $7, scenarios = $8, uploaded_files = $9,
       sheet_url = $10, updated_at = now()
     WHERE id = $1 RETURNING updated_at AS "updatedAt"`,
    [
      p._id,
      p.title,
      p.status,
      p.phase,
      p.currentStep,
      JSON.stringify(p.infoChatHistory ?? []),
      JSON.stringify(p.answers ?? { scenes: [] }),
      JSON.stringify(p.scenarios ?? []),
      JSON.stringify(p.uploadedFiles ?? []),
      p.sheetUrl ?? null,
    ],
  );
  if (rows[0]) p.updatedAt = rows[0].updatedAt;
  return p;
};
