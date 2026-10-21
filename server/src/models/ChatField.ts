import { query } from '../config/db';

export type ChatFieldType = 'text' | 'radio' | 'checkbox';

export interface IChatField {
  _id: string;
  label: string;
  description: string;
  type: ChatFieldType;
  options: string[];
  required: boolean;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ChatFieldInput = Partial<Omit<IChatField, '_id' | 'createdAt' | 'updatedAt'>>;

const COLUMNS = `id AS "_id", label, description, type, options, required, sort_order AS "order",
  active, created_at AS "createdAt", updated_at AS "updatedAt"`;

// API field name -> column name
const WRITABLE: Record<keyof ChatFieldInput, string> = {
  label: 'label',
  description: 'description',
  type: 'type',
  options: 'options',
  required: 'required',
  order: 'sort_order',
  active: 'active',
};

export const findChatFields = (activeOnly = false): Promise<IChatField[]> =>
  query<IChatField>(
    `SELECT ${COLUMNS} FROM chat_fields ${activeOnly ? 'WHERE active' : ''} ORDER BY sort_order, created_at`,
  );

export const findChatFieldById = async (id: string): Promise<IChatField | null> =>
  (await query<IChatField>(`SELECT ${COLUMNS} FROM chat_fields WHERE id = $1`, [id]))[0] ?? null;

export const nextChatFieldOrder = async (): Promise<number> =>
  (await query<{ next: number }>(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM chat_fields`))[0].next;

export const createChatField = async (data: ChatFieldInput): Promise<IChatField> => {
  const keys = Object.keys(data).filter((k) => k in WRITABLE) as (keyof ChatFieldInput)[];
  const rows = await query<IChatField>(
    `INSERT INTO chat_fields (${keys.map((k) => WRITABLE[k]).join(', ')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${COLUMNS}`,
    keys.map((k) => data[k]),
  );
  return rows[0];
};

export const updateChatField = async (id: string, data: ChatFieldInput): Promise<IChatField | null> => {
  const keys = Object.keys(data).filter((k) => k in WRITABLE) as (keyof ChatFieldInput)[];
  if (keys.length === 0) return findChatFieldById(id);
  const rows = await query<IChatField>(
    `UPDATE chat_fields SET ${keys.map((k, i) => `${WRITABLE[k]} = $${i + 2}`).join(', ')}, updated_at = now()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...keys.map((k) => data[k])],
  );
  return rows[0] ?? null;
};

export const deleteChatField = async (id: string): Promise<boolean> =>
  (await query(`DELETE FROM chat_fields WHERE id = $1 RETURNING id`, [id])).length > 0;

export const reorderChatFields = async (orderedIds: string[]): Promise<void> => {
  await query(
    `UPDATE chat_fields AS f SET sort_order = o.ord - 1, updated_at = now()
     FROM unnest($1::text[]) WITH ORDINALITY AS o(id, ord) WHERE f.id = o.id`,
    [orderedIds],
  );
};
