import { Router } from 'express';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProjectAnswers,
} from '../controllers/project.controller';

const router = Router();

// Routes for /api/admin/projects
// Note: Auth has been intentionally left out for now as requested.

router.get('/', getProjects);
router.post('/', createProject);
router.get('/:id', getProjectById);
router.patch('/:id/answers', updateProjectAnswers);

export default router;
