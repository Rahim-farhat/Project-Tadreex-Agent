import { Router } from 'express';
import { getAllUsers, getAllConversations, deleteUser } from '../controllers/admin.controller';
import { protect, adminOnly } from '../middleware/auth';

const router = Router();

// All admin routes require authentication AND admin role
router.use(protect, adminOnly);

// GET /api/admin/users
router.get('/users', getAllUsers);

// GET /api/admin/conversations
router.get('/conversations', getAllConversations);

// DELETE /api/admin/users/:id
router.delete('/users/:id', deleteUser);

export default router;
