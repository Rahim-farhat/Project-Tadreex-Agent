import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  PROJECT_STATUSES,
  createProject as insertProject,
  deleteProjectById,
  findProjectById,
  findProjects,
  saveProject,
} from '../models/Project';

const isValidStatus = (status: unknown) =>
  status === undefined || PROJECT_STATUSES.includes(status as any);

// GET /api/admin/projects
export const getProjects = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await findProjects());
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
    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ message: 'Error fetching project' });
  }
};

// POST /api/admin/projects
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title } = req.body;

    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ message: 'Project title is required' });
      return;
    }

    res.status(201).json(await insertProject(title, req.user?.id));
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
