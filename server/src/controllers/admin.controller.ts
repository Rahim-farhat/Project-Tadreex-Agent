import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';
import Conversation from '../models/Conversation';

// GET /api/admin/users
export const getAllUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json(users);
};

// GET /api/admin/conversations
export const getAllConversations = async (_req: AuthRequest, res: Response): Promise<void> => {
  const conversations = await Conversation.find()
    .populate('userId', 'name email')
    .sort({ updatedAt: -1 });
  res.json(conversations);
};

// DELETE /api/admin/users/:id
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  // Also clean up their conversations
  await Conversation.deleteMany({ userId: req.params.id });
  res.json({ message: 'User and their conversations deleted' });
};
