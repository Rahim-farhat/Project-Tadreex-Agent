import { Pool, QueryResultRow } from 'pg';
import { SCHEMA_SQL } from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is not defined in environment variables');
  process.exit(1);
}

export const pool = new Pool({ connectionString, max: 10 });

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
});

export const query = async <T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> => {
  const { rows } = await pool.query<T>(text, params);
  return rows;
};

// Connects and applies the (idempotent) schema. Retries so the API can start
// before the database container is ready to accept connections.
export const connectDB = async (retries = 10): Promise<void> => {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query(SCHEMA_SQL);
      console.log('✅ PostgreSQL connected, schema up to date');
      return;
    } catch (error) {
      if (attempt >= retries) {
        console.error('❌ PostgreSQL connection error:', error);
        process.exit(1);
      }
      console.warn(`PostgreSQL not ready (attempt ${attempt}/${retries}), retrying in 2s…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};
