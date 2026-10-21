import { Request, Response } from 'express';
import {
  ChatFieldInput,
  createChatField as insertChatField,
  deleteChatField as removeChatField,
  findChatFieldById,
  findChatFields,
  nextChatFieldOrder,
  reorderChatFields as applyChatFieldOrder,
  updateChatField as patchChatField,
} from '../models/ChatField';
import { invalidateFieldCache } from './chatbot.controller';

const FIELD_TYPES = ['text', 'radio', 'checkbox'];

const cleanOptions = (options: unknown): string[] =>
  Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : [];

// GET /api/admin/chatfields — list all fields
export const getChatFields = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await findChatFields());
  } catch (error) {
    console.error('Get chat fields error:', error);
    res.status(500).json({ message: 'Error fetching chat fields' });
  }
};

// GET /api/admin/chatfields/:id — get single field
export const getChatFieldById = async (req: Request, res: Response): Promise<void> => {
  try {
    const field = await findChatFieldById(req.params.id);
    if (!field) {
      res.status(404).json({ message: 'Chat field not found' });
      return;
    }
    res.json(field);
  } catch (error) {
    console.error('Get chat field error:', error);
    res.status(500).json({ message: 'Error fetching chat field' });
  }
};

// POST /api/admin/chatfields — create field
export const createChatField = async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, description, type, options, required, order, active } = req.body;

    if (typeof label !== 'string' || !label.trim()) {
      res.status(400).json({ message: 'Field label is required' });
      return;
    }
    if (type !== undefined && !FIELD_TYPES.includes(type)) {
      res.status(400).json({ message: 'Invalid field type' });
      return;
    }
    const opts = cleanOptions(options);
    if ((type === 'radio' || type === 'checkbox') && opts.length === 0) {
      res.status(400).json({ message: 'Options are required for radio/checkbox fields' });
      return;
    }

    const field = await insertChatField({
      label: label.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      type: type || 'text',
      options: type === 'radio' || type === 'checkbox' ? opts : [],
      required: required !== false,
      order: Number.isInteger(order) ? order : await nextChatFieldOrder(),
      active: active !== false,
    });

    invalidateFieldCache();
    res.status(201).json(field);
  } catch (error) {
    console.error('Create chat field error:', error);
    res.status(500).json({ message: 'Error creating chat field' });
  }
};

// PATCH /api/admin/chatfields/:id — update field
export const updateChatField = async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, description, type, options, required, order, active } = req.body;
    if (type !== undefined && !FIELD_TYPES.includes(type)) {
      res.status(400).json({ message: 'Invalid field type' });
      return;
    }

    const patch: ChatFieldInput = {};
    if (typeof label === 'string' && label.trim()) patch.label = label.trim();
    if (typeof description === 'string') patch.description = description.trim();
    if (type !== undefined) patch.type = type;
    if (options !== undefined) patch.options = cleanOptions(options);
    if (type === 'text') patch.options = [];
    if (typeof required === 'boolean') patch.required = required;
    if (Number.isInteger(order)) patch.order = order;
    if (typeof active === 'boolean') patch.active = active;

    const field = await patchChatField(req.params.id, patch);
    if (!field) {
      res.status(404).json({ message: 'Chat field not found' });
      return;
    }
    invalidateFieldCache();
    res.json(field);
  } catch (error) {
    console.error('Update chat field error:', error);
    res.status(500).json({ message: 'Error updating chat field' });
  }
};

// DELETE /api/admin/chatfields/:id — delete field
export const deleteChatField = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await removeChatField(req.params.id))) {
      res.status(404).json({ message: 'Chat field not found' });
      return;
    }
    invalidateFieldCache();
    res.json({ message: 'Chat field deleted' });
  } catch (error) {
    console.error('Delete chat field error:', error);
    res.status(500).json({ message: 'Error deleting chat field' });
  }
};

// PATCH /api/admin/chatfields/reorder — reorder fields
export const reorderChatFields = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === 'string')) {
      res.status(400).json({ message: 'orderedIds array is required' });
      return;
    }

    await applyChatFieldOrder(orderedIds);
    invalidateFieldCache();
    res.json(await findChatFields());
  } catch (error) {
    console.error('Reorder chat fields error:', error);
    res.status(500).json({ message: 'Error reordering chat fields' });
  }
};
