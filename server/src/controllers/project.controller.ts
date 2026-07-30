import { Request, Response } from 'express';
import Project from '../models/Project';

// GET /api/admin/projects
export const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching projects', error });
  }
};

// GET /api/admin/projects/:id
export const getProjectById = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project', error });
  }
};

// POST /api/admin/projects
export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, createdBy } = req.body;
    
    if (!title) {
      res.status(400).json({ message: 'Project title is required' });
      return;
    }

    const newProject = await Project.create({
      title,
      createdBy, // Optional for now
    });

    res.status(201).json(newProject);
  } catch (error) {
    res.status(500).json({ message: 'Error creating project', error });
  }
};

// PATCH /api/admin/projects/:id/answers
export const updateProjectAnswers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { answers, currentStep, status } = req.body;

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (answers) {
      // Merge new answers with existing answers
      project.answers = { ...project.answers, ...answers };
    }
    
    if (currentStep !== undefined) {
      project.currentStep = currentStep;
    }
    
    if (status) {
      project.status = status;
    }

    await project.save();
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error updating project answers', error });
  }
};
