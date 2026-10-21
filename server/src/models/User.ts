import bcrypt from 'bcryptjs';
import { query } from '../config/db';

export interface IUser {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id AS "_id", name, email, role, created_at AS "createdAt", updated_at AS "updatedAt"`;

export const hashPassword = async (password: string): Promise<string> =>
  bcrypt.hash(password, await bcrypt.genSalt(10));

export const findUsers = (): Promise<IUser[]> =>
  query<IUser>(`SELECT ${COLUMNS} FROM users ORDER BY created_at DESC`);

export const findUserByEmail = async (email: string): Promise<IUser | null> =>
  (await query<IUser>(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email]))[0] ?? null;

// Returns the user only when the password matches
export const verifyCredentials = async (email: string, password: string): Promise<IUser | null> => {
  const rows = await query<IUser & { password: string }>(
    `SELECT ${COLUMNS}, password FROM users WHERE email = $1`,
    [email],
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.password))) return null;
  const { password: _hash, ...user } = row;
  return user;
};

export const createUser = async (data: {
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
}): Promise<IUser> => {
  const rows = await query<IUser>(
    `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [data.name.trim(), data.email, await hashPassword(data.password), data.role ?? 'user'],
  );
  return rows[0];
};

export const deleteUserById = async (id: string): Promise<boolean> =>
  (await query(`DELETE FROM users WHERE id = $1 RETURNING id`, [id])).length > 0;

// Creates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD on first start.
// An existing account is never modified, so changing the env later is harmless.
export const ensureAdminUser = async (): Promise<void> => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (await findUserByEmail(email)) return;
  if (password.length < 8) {
    console.warn('⚠️  ADMIN_PASSWORD must be at least 8 characters; admin account not created');
    return;
  }
  await createUser({ name: process.env.ADMIN_NAME || 'Admin', email, password, role: 'admin' });
  console.log(`👤 Created admin account ${email}`);
};
