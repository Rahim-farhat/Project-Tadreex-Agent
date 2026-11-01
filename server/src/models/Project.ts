import { randomInt, randomUUID } from 'crypto';
import { query } from '../config/db';
import type { ProjectMode } from './ScenarioField';

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
export type ProjectPhase = 'info' | 'review' | 'scenario' | 'brainstorm' | 'refine' | 'final' | 'completed';

// A project is loaded as a plain object, mutated by the controllers, then
// written back in full with saveProject().
export interface IProject {
  _id: string;
  title: string;
  status: ProjectStatus;
  clientToken: string;
  createdBy?: string | null;
  // null = legacy step-by-step chat; otherwise brainstorm -> refine -> final flow
  mode?: ProjectMode | null;
  brainstormText: string;
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
  mode, brainstorm_text AS "brainstormText", phase, current_step AS "currentStep", info_chat_history AS "infoChatHistory", answers, scenarios,
  uploaded_files AS "uploadedFiles", sheet_url AS "sheetUrl", created_at AS "createdAt", updated_at AS "updatedAt"`;

export const newScenarioBlock = (name: string): IScenarioBlock => ({
  _id: randomUUID(),
  name,
  currentField: 0,
  chatHistory: [],
  answers: {},
  builder: { state: 'collecting' },
});

export interface IProjectWithCreator extends IProject {
  createdByName?: string | null;
  createdByUsername?: string | null;
  createdByRole?: string | null;
}

export const findProjects = (): Promise<IProject[]> =>
  query<IProject>(`SELECT ${COLUMNS} FROM projects ORDER BY created_at DESC`);

export const findProjectsWithCreator = (): Promise<IProjectWithCreator[]> =>
  query<IProjectWithCreator>(`
    SELECT p.id AS "_id", p.title, p.status, p.client_token AS "clientToken", p.created_by AS "createdBy",
           p.mode, p.brainstorm_text AS "brainstormText", p.phase, p.current_step AS "currentStep", p.info_chat_history AS "infoChatHistory", p.answers, p.scenarios,
           p.uploaded_files AS "uploadedFiles", p.sheet_url AS "sheetUrl", p.created_at AS "createdAt", p.updated_at AS "updatedAt",
           u.name AS "createdByName", COALESCE(u.username, u.name) AS "createdByUsername", u.role AS "createdByRole"
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    ORDER BY p.created_at DESC
  `);

export const findProjectsByCreator = (creatorId: string): Promise<IProject[]> =>
  query<IProject>(`SELECT ${COLUMNS} FROM projects WHERE created_by = $1 ORDER BY created_at DESC`, [creatorId]);

export const countProjectsByCreator = async (creatorId: string): Promise<number> => {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM projects WHERE created_by = $1`,
    [creatorId],
  );
  return parseInt(rows[0]?.count || '0', 10);
};

export const findProjectsByManager = async (managerId: string): Promise<Array<{
  _id: string;
  title: string;
  status: ProjectStatus;
  clientToken: string;
  createdAt: Date;
}>> => {
  return query(`
    SELECT id AS "_id", title, status, client_token AS "clientToken", created_at AS "createdAt"
    FROM projects
    WHERE created_by = $1
    ORDER BY created_at DESC
  `, [managerId]);
};

export const findProjectById = async (id: string): Promise<IProject | null> =>
  (await query<IProject>(`SELECT ${COLUMNS} FROM projects WHERE id = $1`, [id]))[0] ?? null;

export const findProjectByToken = async (token: string): Promise<IProject | null> =>
  (await query<IProject>(`SELECT ${COLUMNS} FROM projects WHERE client_token = $1`, [token]))[0] ?? null;

export const createProject = async (
  title: string,
  createdBy?: string,
  mode?: ProjectMode | null,
): Promise<IProject> =>
  (
    await query<IProject>(
      `INSERT INTO projects (title, client_token, created_by, mode) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
      [title.trim(), generateToken(), createdBy ?? null, mode ?? null],
    )
  )[0];

export const deleteProjectById = async (id: string): Promise<boolean> =>
  (await query(`DELETE FROM projects WHERE id = $1 RETURNING id`, [id])).length > 0;

export const saveProject = async (p: IProject): Promise<IProject> => {
  const rows = await query<{ updatedAt: Date }>(
    `UPDATE projects SET
       title = $2, status = $3, phase = $4, current_step = $5,
       info_chat_history = $6, answers = $7, scenarios = $8, uploaded_files = $9,
       sheet_url = $10, brainstorm_text = $11, updated_at = now()
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
      p.brainstormText ?? '',
    ],
  );
  if (rows[0]) p.updatedAt = rows[0].updatedAt;
  return p;
};
