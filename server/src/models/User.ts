import bcrypt from 'bcryptjs';
import { query } from '../config/db';

export type UserRole = 'admin' | 'manager' | 'user';

export interface IUser {
  _id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id AS "_id", name, COALESCE(username, name) AS username, email, role, created_at AS "createdAt", updated_at AS "updatedAt"`;

export const hashPassword = async (password: string): Promise<string> =>
  bcrypt.hash(password, await bcrypt.genSalt(10));

export const findUsers = (): Promise<IUser[]> =>
  query<IUser>(`SELECT ${COLUMNS} FROM users ORDER BY created_at DESC`);

export const findManagers = (): Promise<IUser[]> =>
  query<IUser>(`SELECT ${COLUMNS} FROM users WHERE role = 'manager' ORDER BY created_at DESC`);

export const findUserById = async (id: string): Promise<IUser | null> =>
  (await query<IUser>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]))[0] ?? null;

export const findUserByEmail = async (email: string): Promise<IUser | null> =>
  (await query<IUser>(`SELECT ${COLUMNS} FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]))[0] ?? null;

export const findUserByUsername = async (username: string): Promise<IUser | null> => {
  const clean = username.trim().toLowerCase();
  return (
    await query<IUser>(
      `SELECT ${COLUMNS} FROM users WHERE LOWER(username) = $1 OR LOWER(name) = $1 OR LOWER(email) = $1`,
      [clean],
    )
  )[0] ?? null;
};

// Returns the user only when the password matches (accepts username or email)
export const verifyCredentials = async (identifier: string, password: string): Promise<IUser | null> => {
  const clean = identifier.trim().toLowerCase();
  const rows = await query<IUser & { password: string }>(
    `SELECT ${COLUMNS}, password FROM users
     WHERE LOWER(email) = $1 OR LOWER(COALESCE(username, '')) = $1 OR LOWER(name) = $1`,
    [clean],
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.password))) return null;
  const { password: _hash, ...user } = row;
  return user;
};

export const createUser = async (data: {
  name: string;
  username?: string;
  email: string;
  password: string;
  role?: UserRole;
}): Promise<IUser> => {
  const username = (data.username || data.name).trim();
  const rows = await query<IUser>(
    `INSERT INTO users (name, username, email, password, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [data.name.trim(), username, data.email.trim().toLowerCase(), await hashPassword(data.password), data.role ?? 'user'],
  );
  return rows[0];
};

export const createManager = async (username: string, password: string): Promise<IUser> => {
  const trimmed = username.trim();
  const email = trimmed.includes('@') ? trimmed.toLowerCase() : `${trimmed.toLowerCase()}@tadreex.local`;
  const rows = await query<IUser>(
    `INSERT INTO users (name, username, email, password, role)
     VALUES ($1, $2, $3, $4, 'manager')
     RETURNING ${COLUMNS}`,
    [trimmed, trimmed, email, await hashPassword(password)],
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
