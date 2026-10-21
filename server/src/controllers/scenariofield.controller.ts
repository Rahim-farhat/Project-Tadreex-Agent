import { Request, Response } from 'express';
import {
  ScenarioFieldInput,
  createScenarioField as insertScenarioField,
  deleteScenarioField as removeScenarioField,
  findScenarioFieldById,
  findScenarioFields,
  nextScenarioFieldOrder,
  updateScenarioField as patchScenarioField,
} from '../models/ScenarioField';
import { invalidateFieldCache } from './chatbot.controller';

const FIELD_TYPES = ['text', 'radio', 'checkbox'];

const cleanOptions = (options: unknown): string[] =>
  Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : [];

const toKey = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');

export const getScenarioFields = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await findScenarioFields());
  } catch (error) {
    console.error('Get scenario fields error:', error);
    res.status(500).json({ message: 'Error fetching scenario fields' });
  }
};

export const getScenarioFieldById = async (req: Request, res: Response): Promise<void> => {
  try {
    const field = await findScenarioFieldById(req.params.id);
    if (!field) { res.status(404).json({ message: 'Scenario field not found' }); return; }
    res.json(field);
  } catch (error) {
    console.error('Get scenario field error:', error);
    res.status(500).json({ message: 'Error fetching scenario field' });
  }
};

export const createScenarioField = async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, label, description, forbidden, type, options, required, order, active } = req.body;
    if (typeof label !== 'string' || !label.trim()) { res.status(400).json({ message: 'Field label is required' }); return; }
    if (type !== undefined && !FIELD_TYPES.includes(type)) { res.status(400).json({ message: 'Invalid field type' }); return; }
    const field = await insertScenarioField({
      key: typeof key === 'string' && key.trim() ? key.trim() : toKey(label),
      label: label.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      forbidden: typeof forbidden === 'string' ? forbidden.trim() : '',
      type: type || 'text',
      options: cleanOptions(options),
      required: required !== false,
      order: Number.isInteger(order) ? order : await nextScenarioFieldOrder(),
      active: active !== false,
    });
    invalidateFieldCache();
    res.status(201).json(field);
  } catch (error) {
    console.error('Create scenario field error:', error);
    res.status(500).json({ message: 'Error creating scenario field' });
  }
};

export const updateScenarioField = async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, label, description, forbidden, type, options, required, order, active } = req.body;
    if (type !== undefined && !FIELD_TYPES.includes(type)) { res.status(400).json({ message: 'Invalid field type' }); return; }
    const patch: ScenarioFieldInput = {};
    if (typeof key === 'string' && key.trim()) patch.key = key.trim();
    if (typeof label === 'string' && label.trim()) patch.label = label.trim();
    if (typeof description === 'string') patch.description = description.trim();
    if (typeof forbidden === 'string') patch.forbidden = forbidden.trim();
    if (type !== undefined) patch.type = type;
    if (options !== undefined) patch.options = cleanOptions(options);
    if (type === 'text') patch.options = [];
    if (typeof required === 'boolean') patch.required = required;
    if (Number.isInteger(order)) patch.order = order;
    if (typeof active === 'boolean') patch.active = active;

    const field = await patchScenarioField(req.params.id, patch);
    if (!field) { res.status(404).json({ message: 'Scenario field not found' }); return; }
    invalidateFieldCache();
    res.json(field);
  } catch (error) {
    console.error('Update scenario field error:', error);
    res.status(500).json({ message: 'Error updating scenario field' });
  }
};

export const deleteScenarioField = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await removeScenarioField(req.params.id))) { res.status(404).json({ message: 'Scenario field not found' }); return; }
    invalidateFieldCache();
    res.json({ message: 'Scenario field deleted' });
  } catch (error) {
    console.error('Delete scenario field error:', error);
    res.status(500).json({ message: 'Error deleting scenario field' });
  }
};
