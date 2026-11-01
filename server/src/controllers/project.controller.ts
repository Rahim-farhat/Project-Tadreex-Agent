import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  PROJECT_STATUSES,
  countProjectsByCreator,
  createProject as insertProject,
  deleteProjectById,
  findProjectById,
  findProjects,
  findProjectsByCreator,
  findProjectsWithCreator,
  saveProject,
} from '../models/Project';
import { PROJECT_MODES } from '../models/ScenarioField';

const isValidStatus = (status: unknown) =>
  status === undefined || PROJECT_STATUSES.includes(status as any);

// GET /api/admin/projects
export const getProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role === 'manager') {
      res.json(await findProjectsByCreator(req.user.id));
      return;
    }
    res.json(await findProjectsWithCreator());
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ message: 'Error fetching projects' });
  }
};

// GET /api/admin/projects/:id
export const getProjectById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await findProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (req.user?.role === 'manager' && project.createdBy !== req.user.id) {
      res.status(403).json({ message: 'Access denied: not your project' });
      return;
    }

    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ message: 'Error fetching project' });
  }
};

// POST /api/admin/projects
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, mode } = req.body;

    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ message: 'Project title is required' });
      return;
    }
    if (mode !== undefined && mode !== null && !PROJECT_MODES.includes(mode)) {
      res.status(400).json({ message: 'Invalid mode' });
      return;
    }

    // Manager role is limited to at most 10 projects
    if (req.user?.role === 'manager') {
      const count = await countProjectsByCreator(req.user.id);
      if (count >= 10) {
        res.status(403).json({
          message: 'Project limit reached. Managers can create up to 10 projects.',
        });
        return;
      }
    }

    res.status(201).json(await insertProject(title, req.user?.id, mode));
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ message: 'Error creating project' });
  }
};

// PATCH /api/admin/projects/:id (rename)
export const updateProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, status } = req.body;
    if (!isValidStatus(status)) {
      res.status(400).json({ message: 'Invalid status' });
      return;
    }
    const project = await findProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (req.user?.role === 'manager' && project.createdBy !== req.user.id) {
      res.status(403).json({ message: 'Access denied: not your project' });
      return;
    }

    if (typeof title === 'string' && title.trim()) project.title = title.trim();
    if (status) project.status = status;
    res.json(await saveProject(project));
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ message: 'Error updating project' });
  }
};

// DELETE /api/admin/projects/:id
export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await findProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (req.user?.role === 'manager' && project.createdBy !== req.user.id) {
      res.status(403).json({ message: 'Access denied: not your project' });
      return;
    }

    if (!(await deleteProjectById(req.params.id))) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    res.json({ message: 'Project deleted' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ message: 'Error deleting project' });
  }
};

// PATCH /api/admin/projects/:id/answers
export const updateProjectAnswers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { answers, currentStep, status } = req.body;
    if (!isValidStatus(status)) {
      res.status(400).json({ message: 'Invalid status' });
      return;
    }

    const project = await findProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (req.user?.role === 'manager' && project.createdBy !== req.user.id) {
      res.status(403).json({ message: 'Access denied: not your project' });
      return;
    }

    if (answers && typeof answers === 'object') {
      // Merge new answers with existing answers
      project.answers = { ...project.answers, ...answers };
    }
    if (Number.isInteger(currentStep) && currentStep >= 0) {
      project.currentStep = currentStep;
    }
    if (status) {
      project.status = status;
    }

    res.json(await saveProject(project));
  } catch (error) {
    console.error('Update answers error:', error);
    res.status(500).json({ message: 'Error updating project answers' });
  }
};
