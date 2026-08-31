import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';

// GET /api/admin/users
export const getAllUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json(users);
};

// DELETE /api/admin/users/:id
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json({ message: 'User deleted' });
};
