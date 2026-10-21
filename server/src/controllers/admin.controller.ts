import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { deleteUserById, findUsers } from '../models/User';

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
