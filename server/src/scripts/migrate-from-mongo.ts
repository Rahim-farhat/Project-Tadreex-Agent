/**
 * One-off copy of the legacy MongoDB data into PostgreSQL.
 *
 *   MONGODB_URI=mongodb+srv://… DATABASE_URL=postgres://… node dist/scripts/migrate-from-mongo.js
 *
 * Safe to re-run: rows whose id (or unique email / client token) already
 * exists are skipped. Mongo ObjectIds are kept as the Postgres ids, so
 * existing client links (/chat/<token>) and stored references keep working.
 */
import 'dotenv/config';
import dns from 'dns';
import { MongoClient } from 'mongodb';
import { connectDB, pool } from '../config/db';

// Some networks' DNS servers can't resolve Atlas SRV records
if (process.env.MONGO_DNS !== 'system') dns.setServers(['8.8.8.8', '8.8.4.4']);

// ObjectId -> hex string, Date -> ISO string, recursively
const plain = (v: unknown): any => JSON.parse(JSON.stringify(v ?? null));
const id = (doc: any): string => String(doc._id);
const json = (v: unknown, fallback: unknown) => JSON.stringify(plain(v) ?? fallback);

async function copy(
  label: string,
  docs: any[],
  sql: string,
  values: (doc: any) => unknown[],
): Promise<void> {
  let inserted = 0;
  for (const doc of docs) {
    const { rowCount } = await pool.query(sql, values(doc));
    inserted += rowCount ?? 0;
  }
  console.log(`  ${label.padEnd(16)} ${inserted} inserted, ${docs.length - inserted} skipped`);
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is required');

  await connectDB(3);
  const mongo = await MongoClient.connect(mongoUri);
  const db = mongo.db();
  console.log(`Copying MongoDB "${db.databaseName}" → PostgreSQL`);
  const all = (name: string) => db.collection(name).find().toArray();

  await copy(
    'users',
    await all('users'),
    `INSERT INTO users (id, name, email, password, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), COALESCE($7, now()))
     ON CONFLICT DO NOTHING`,
    (u) => [id(u), u.name ?? '', String(u.email).toLowerCase(), u.password, u.role ?? 'user', u.createdAt, u.updatedAt],
  );

  await copy(
    'chat_fields',
    await all('chatfields'),
    `INSERT INTO chat_fields (id, label, description, type, options, required, sort_order, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), COALESCE($10, now()))
     ON CONFLICT DO NOTHING`,
    (f) => [id(f), f.label, f.description ?? '', f.type ?? 'text', f.options ?? [], f.required !== false,
      f.order ?? 0, f.active !== false, f.createdAt, f.updatedAt],
  );

  await copy(
    'scenario_fields',
    await all('scenariofields'),
    `INSERT INTO scenario_fields (id, key, label, description, forbidden, type, options, required, sort_order, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, now()), COALESCE($12, now()))
     ON CONFLICT DO NOTHING`,
    (f) => [id(f), f.key ?? '', f.label, f.description ?? '', f.forbidden ?? '', f.type ?? 'text', f.options ?? [],
      f.required !== false, f.order ?? 0, f.active !== false, f.createdAt, f.updatedAt],
  );

  await copy(
    'projects',
    await all('projects'),
    `INSERT INTO projects (id, title, status, client_token, created_by, phase, current_step, info_chat_history,
       answers, scenarios, uploaded_files, sheet_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, now()), COALESCE($14, now()))
     ON CONFLICT DO NOTHING`,
    (p) => [id(p), p.title, p.status ?? 'draft', p.clientToken, p.createdBy ? String(p.createdBy) : null,
      p.phase ?? 'info', p.currentStep ?? 0, json(p.infoChatHistory, []), json(p.answers, { scenes: [] }),
      json(p.scenarios, []), json(p.uploadedFiles, []), p.sheetUrl ?? null, p.createdAt, p.updatedAt],
  );

  const settings = await db.collection('settings').findOne();
  if (settings) {
    await pool.query(
      `INSERT INTO settings (id, groq_model_strong, groq_model_fast, groq_temperature, groq_fast_temperature)
       VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET groq_model_strong = EXCLUDED.groq_model_strong,
         groq_model_fast = EXCLUDED.groq_model_fast, groq_temperature = EXCLUDED.groq_temperature,
         groq_fast_temperature = EXCLUDED.groq_fast_temperature, updated_at = now()`,
      [settings.groqModelStrong ?? 'openai/gpt-oss-120b', settings.groqModelFast ?? 'openai/gpt-oss-20b',
        settings.groqTemperature ?? 0.1, settings.groqFastTemperature ?? 0.2],
    );
    console.log('  settings         copied');
  }

  await mongo.close();
  await pool.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
