import { query } from '../config/db';

export interface ISettings {
  groqModelStrong: string;
  groqModelFast: string;
  groqTemperature: number;
  groqFastTemperature: number;
  groqApiKey?: string | null;
}

const COLUMNS = `groq_model_strong AS "groqModelStrong", groq_model_fast AS "groqModelFast",
  groq_temperature AS "groqTemperature", groq_fast_temperature AS "groqFastTemperature",
  groq_api_key AS "groqApiKey"`;

// Single-row table: the row is created with defaults on first read
export const getSettings = async (): Promise<ISettings> =>
  (
    await query<ISettings>(
      `INSERT INTO settings (id) VALUES (1)
       ON CONFLICT (id) DO UPDATE SET id = settings.id
       RETURNING ${COLUMNS}`,
    )
  )[0];

export const saveSettings = async (s: ISettings): Promise<ISettings> =>
  (
    await query<ISettings>(
      `INSERT INTO settings (id, groq_model_strong, groq_model_fast, groq_temperature, groq_fast_temperature, groq_api_key)
       VALUES (1, $1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         groq_model_strong = EXCLUDED.groq_model_strong,
         groq_model_fast = EXCLUDED.groq_model_fast,
         groq_temperature = EXCLUDED.groq_temperature,
         groq_fast_temperature = EXCLUDED.groq_fast_temperature,
         groq_api_key = EXCLUDED.groq_api_key,
         updated_at = now()
       RETURNING ${COLUMNS}`,
      [s.groqModelStrong, s.groqModelFast, s.groqTemperature, s.groqFastTemperature, s.groqApiKey ?? null],
    )
  )[0];
