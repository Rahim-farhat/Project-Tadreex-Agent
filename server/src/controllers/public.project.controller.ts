import { Request, Response } from 'express';
import Project from '../models/Project';

// GET /api/public/projects/:token
export const getProjectByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await Project.findOne({ clientToken: req.params.token });
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project', error });
  }
};

// PATCH /api/public/projects/:token/answers
export const updateProjectAnswersByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { answers, currentStep } = req.body;

    const project = await Project.findOne({ clientToken: token });
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (answers) {
      project.answers = { ...project.answers, ...answers };
    }
    
    if (currentStep !== undefined) {
      project.currentStep = currentStep;
    }

    await project.save();
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error updating project answers', error });
  }
};
