import { Router } from 'express';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  updateProjectAnswers,
} from '../controllers/project.controller';

const router = Router();

router.get('/', getProjects);
router.post('/', createProject);
router.get('/:id', getProjectById);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);
router.patch('/:id/answers', updateProjectAnswers);

export default router;
