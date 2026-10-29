import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail, verifyCredentials } from '../models/User';

const generateToken = (id: string, role: string): string => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
};

const normalizeEmail = (email: unknown): string =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

// POST /api/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !password) {
      res.status(400).json({ message: 'All fields are required' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
      return;
    }

    if (await findUserByEmail(email)) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }

    const user = await createUser({ name: String(name), email, password });
    const token = generateToken(user._id, user.role);

    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Error creating account' });
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const identifier =
      typeof req.body.username === 'string' && req.body.username.trim()
        ? req.body.username.trim()
        : typeof req.body.email === 'string' && req.body.email.trim()
        ? req.body.email.trim()
        : '';

    if (!identifier || !password) {
      res.status(400).json({ message: 'Username/email and password are required' });
      return;
    }

    const user = await verifyCredentials(identifier, String(password));
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = generateToken(user._id, user.role);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username || user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error signing in' });
  }
};
