import { Router } from 'express';
import { getProjectByToken, updateProjectAnswersByToken } from '../controllers/public.project.controller';

const router = Router();

// Routes for /api/public/projects
router.get('/:token', getProjectByToken);
router.patch('/:token/answers', updateProjectAnswersByToken);

export default router;
