import { Request, Response } from 'express';
import ScenarioField from '../models/ScenarioField';

export const getScenarioFields = async (_req: Request, res: Response): Promise<void> => {
  try {
    const fields = await ScenarioField.find().sort({ order: 1 });
    res.json(fields);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching scenario fields', error });
  }
};

export const getScenarioFieldById = async (req: Request, res: Response): Promise<void> => {
  try {
    const field = await ScenarioField.findById(req.params.id);
    if (!field) { res.status(404).json({ message: 'Scenario field not found' }); return; }
    res.json(field);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching scenario field', error });
  }
};

export const createScenarioField = async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, label, description, forbidden, type, options, required, order, active } = req.body;
    if (!label || !label.trim()) { res.status(400).json({ message: 'Field label is required' }); return; }
    let finalOrder = order;
    if (finalOrder === undefined || finalOrder === null) {
      const maxOrder = await ScenarioField.findOne().sort({ order: -1 }).select('order');
      finalOrder = (maxOrder?.order ?? -1) + 1;
    }
    const field = await ScenarioField.create({
      key: key?.trim() || label.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'),
      label: label.trim(),
      description: description?.trim() || '',
      forbidden: forbidden?.trim() || '',
      type: type || 'text',
      options: options || [],
      required: required !== false,
      order: finalOrder,
      active: active !== false,
    });
    res.status(201).json(field);
  } catch (error) {
    res.status(500).json({ message: 'Error creating scenario field', error });
  }
};

export const updateScenarioField = async (req: Request, res: Response): Promise<void> => {
  try {
    const field = await ScenarioField.findById(req.params.id);
    if (!field) { res.status(404).json({ message: 'Scenario field not found' }); return; }
    const { key, label, description, forbidden, type, options, required, order, active } = req.body;
    if (key !== undefined) field.key = key.trim();
    if (label !== undefined) field.label = label.trim();
    if (description !== undefined) field.description = description.trim();
    if (forbidden !== undefined) field.forbidden = forbidden.trim();
    if (type !== undefined) { field.type = type; if (type === 'text') field.options = []; }
    if (options !== undefined) field.options = options;
    if (required !== undefined) field.required = required;
    if (order !== undefined) field.order = order;
    if (active !== undefined) field.active = active;
    await field.save();
    res.json(field);
  } catch (error) {
    res.status(500).json({ message: 'Error updating scenario field', error });
  }
};

export const deleteScenarioField = async (req: Request, res: Response): Promise<void> => {
  try {
    const field = await ScenarioField.findByIdAndDelete(req.params.id);
    if (!field) { res.status(404).json({ message: 'Scenario field not found' }); return; }
    res.json({ message: 'Scenario field deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting scenario field', error });
  }
};
