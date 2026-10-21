import { Request, Response } from 'express';
import { findProjectByToken, saveProject } from '../models/Project';

// GET /api/public/projects/:token
export const getProjectByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await findProjectByToken(req.params.token);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    console.error('Get public project error:', error);
    res.status(500).json({ message: 'Error fetching project' });
  }
};

// PATCH /api/public/projects/:token/answers
export const updateProjectAnswersByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { answers, currentStep } = req.body;

    const project = await findProjectByToken(req.params.token);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (answers && typeof answers === 'object') {
      project.answers = { ...project.answers, ...answers };
    }
    if (Number.isInteger(currentStep) && currentStep >= 0) {
      project.currentStep = currentStep;
    }

    res.json(await saveProject(project));
  } catch (error) {
    console.error('Update public answers error:', error);
    res.status(500).json({ message: 'Error updating project answers' });
  }
};
