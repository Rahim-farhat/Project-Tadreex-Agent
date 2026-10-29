import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createManager,
  deleteUserById,
  findManagers,
  findUserById,
  findUserByUsername,
  findUsers,
} from '../models/User';
import { findProjectsByManager } from '../models/Project';

// GET /api/admin/users
export const getAllUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await findUsers());
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// DELETE /api/admin/users/:id
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.id === req.params.id) {
      res.status(400).json({ message: 'You cannot delete your own account' });
      return;
    }
    if (!(await deleteUserById(req.params.id))) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

// GET /api/admin/managers
export const getManagers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const managers = await findManagers();
    const managersWithProjects = await Promise.all(
      managers.map(async (m) => {
        const projects = await findProjectsByManager(m._id);
        return {
          ...m,
          projectCount: projects.length,
          projects,
        };
      }),
    );
    res.json(managersWithProjects);
  } catch (error) {
    console.error('Get managers error:', error);
    res.status(500).json({ message: 'Error fetching managers' });
  }
};

// POST /api/admin/managers
export const createManagerHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;
    if (!username || typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ message: 'Username is required' });
      return;
    }
    const trimmedUser = username.trim();
    if (trimmedUser.length < 3) {
      res.status(400).json({ message: 'Username must be at least 3 characters' });
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUser)) {
      res.status(400).json({
        message: 'Username may only contain letters, numbers, dots, underscores, and hyphens',
      });
      return;
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
      return;
    }

    const existing = await findUserByUsername(trimmedUser);
    if (existing) {
      res.status(409).json({ message: 'A user with this username already exists' });
      return;
    }

    const manager = await createManager(trimmedUser, password);
    res.status(201).json({
      message: 'Manager created successfully',
      manager: {
        ...manager,
        projectCount: 0,
        projects: [],
      },
    });
  } catch (error) {
    console.error('Create manager error:', error);
    res.status(500).json({ message: 'Error creating manager' });
  }
};

// DELETE /api/admin/managers/:id
export const deleteManagerHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (req.user?.id === id) {
      res.status(400).json({ message: 'You cannot delete your own account' });
      return;
    }

    const user = await findUserById(id);
    if (!user) {
      res.status(404).json({ message: 'Manager not found' });
      return;
    }

    if (user.role === 'admin') {
      res.status(403).json({ message: 'Cannot delete admin account' });
      return;
    }

    await deleteUserById(id);
    res.json({ message: 'Manager deleted successfully' });
  } catch (error) {
    console.error('Delete manager error:', error);
    res.status(500).json({ message: 'Error deleting manager' });
  }
};
