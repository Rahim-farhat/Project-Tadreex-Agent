import { Router } from 'express';
import { getChatHistory, sendMessage } from '../controllers/chat.controller';
import { protect, optionalAuth } from '../middleware/auth';

const router = Router();

// GET /api/chat/history (strictly protected)
router.get('/history', protect, getChatHistory);

// POST /api/chat/message (public, but extracts user if logged in)
router.post('/message', optionalAuth, sendMessage);

export default router;
