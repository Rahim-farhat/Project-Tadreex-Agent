import { query } from '../config/db';

export type ScenarioFieldType = 'text' | 'radio' | 'checkbox';

export type ProjectMode = 'beginner' | 'intermediate' | 'expert';
export const PROJECT_MODES: ProjectMode[] = ['beginner', 'intermediate', 'expert'];
// A field is asked in a mode when its level rank is <= the mode's rank
export const MODE_RANK: Record<ProjectMode, number> = { beginner: 0, intermediate: 1, expert: 2 };

export interface IScenarioField {
  _id: string;
  key: string;
  level: ProjectMode;
  label: string;
  description: string;
  forbidden: string;
  type: ScenarioFieldType;
  options: string[];
  required: boolean;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ScenarioFieldInput = Partial<Omit<IScenarioField, '_id' | 'createdAt' | 'updatedAt'>>;

const COLUMNS = `id AS "_id", key, level, label, description, forbidden, type, options, required,
  sort_order AS "order", active, created_at AS "createdAt", updated_at AS "updatedAt"`;

// API field name -> column name
const WRITABLE: Record<keyof ScenarioFieldInput, string> = {
  key: 'key',
  level: 'level',
  label: 'label',
  description: 'description',
  forbidden: 'forbidden',
  type: 'type',
  options: 'options',
  required: 'required',
  order: 'sort_order',
  active: 'active',
};

export const findScenarioFields = (activeOnly = false): Promise<IScenarioField[]> =>
  query<IScenarioField>(
    `SELECT ${COLUMNS} FROM scenario_fields ${activeOnly ? 'WHERE active' : ''} ORDER BY sort_order, created_at`,
  );

export const findScenarioFieldById = async (id: string): Promise<IScenarioField | null> =>
  (await query<IScenarioField>(`SELECT ${COLUMNS} FROM scenario_fields WHERE id = $1`, [id]))[0] ?? null;

export const nextScenarioFieldOrder = async (): Promise<number> =>
  (await query<{ next: number }>(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM scenario_fields`))[0].next;

export const createScenarioField = async (data: ScenarioFieldInput): Promise<IScenarioField> => {
  const keys = Object.keys(data).filter((k) => k in WRITABLE) as (keyof ScenarioFieldInput)[];
  const rows = await query<IScenarioField>(
    `INSERT INTO scenario_fields (${keys.map((k) => WRITABLE[k]).join(', ')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${COLUMNS}`,
    keys.map((k) => data[k]),
  );
  return rows[0];
};

export const updateScenarioField = async (
  id: string,
  data: ScenarioFieldInput,
): Promise<IScenarioField | null> => {
  const keys = Object.keys(data).filter((k) => k in WRITABLE) as (keyof ScenarioFieldInput)[];
  if (keys.length === 0) return findScenarioFieldById(id);
  const rows = await query<IScenarioField>(
    `UPDATE scenario_fields SET ${keys.map((k, i) => `${WRITABLE[k]} = $${i + 2}`).join(', ')}, updated_at = now()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...keys.map((k) => data[k])],
  );
  return rows[0] ?? null;
};

export const deleteScenarioField = async (id: string): Promise<boolean> =>
  (await query(`DELETE FROM scenario_fields WHERE id = $1 RETURNING id`, [id])).length > 0;
