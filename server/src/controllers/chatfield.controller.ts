import { Request, Response } from 'express';
import ChatField from '../models/ChatField';

// GET /api/admin/chatfields — list all fields
export const getChatFields = async (_req: Request, res: Response): Promise<void> => {
  try {
    const fields = await ChatField.find().sort({ order: 1, createdAt: 1 });
    res.json(fields);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chat fields', error });
  }
};

// GET /api/admin/chatfields/:id — get single field
export const getChatFieldById = async (req: Request, res: Response): Promise<void> => {
  try {
    const field = await ChatField.findById(req.params.id);
    if (!field) {
      res.status(404).json({ message: 'Chat field not found' });
      return;
    }
    res.json(field);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chat field', error });
  }
};

// POST /api/admin/chatfields — create field
export const createChatField = async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, description, type, options, required, order, active } = req.body;

    if (!label || !label.trim()) {
      res.status(400).json({ message: 'Field label is required' });
      return;
    }

    if ((type === 'radio' || type === 'checkbox') && (!options || options.length === 0)) {
      res.status(400).json({ message: 'Options are required for radio/checkbox fields' });
      return;
    }

    // Auto-calculate order if not provided
    let finalOrder = order;
    if (finalOrder === undefined || finalOrder === null) {
      const maxOrder = await ChatField.findOne().sort({ order: -1 }).select('order');
      finalOrder = (maxOrder?.order ?? -1) + 1;
    }

    const field = await ChatField.create({
      label: label.trim(),
      description: description?.trim() || '',
      type: type || 'text',
      options: options || [],
      required: required !== false,
      order: finalOrder,
      active: active !== false,
    });

    res.status(201).json(field);
  } catch (error) {
    res.status(500).json({ message: 'Error creating chat field', error });
  }
};

// PATCH /api/admin/chatfields/:id — update field
export const updateChatField = async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, description, type, options, required, order, active } = req.body;

    const field = await ChatField.findById(req.params.id);
    if (!field) {
      res.status(404).json({ message: 'Chat field not found' });
      return;
    }

    if (label !== undefined) field.label = label.trim();
    if (description !== undefined) field.description = description.trim();
    if (type !== undefined) {
      field.type = type;
      if (type === 'text') field.options = [];
    }
    if (options !== undefined) field.options = options;
    if (required !== undefined) field.required = required;
    if (order !== undefined) field.order = order;
    if (active !== undefined) field.active = active;

    await field.save();
    res.json(field);
  } catch (error) {
    res.status(500).json({ message: 'Error updating chat field', error });
  }
};

// DELETE /api/admin/chatfields/:id — delete field
export const deleteChatField = async (req: Request, res: Response): Promise<void> => {
  try {
    const field = await ChatField.findByIdAndDelete(req.params.id);
    if (!field) {
      res.status(404).json({ message: 'Chat field not found' });
      return;
    }
    res.json({ message: 'Chat field deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting chat field', error });
  }
};

// PATCH /api/admin/chatfields/reorder — reorder fields
export const reorderChatFields = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      res.status(400).json({ message: 'orderedIds array is required' });
      return;
    }

    const bulkOps = orderedIds.map((id: string, index: number) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } },
      },
    }));

    await ChatField.bulkWrite(bulkOps);
    const fields = await ChatField.find().sort({ order: 1 });
    res.json(fields);
  } catch (error) {
    res.status(500).json({ message: 'Error reordering chat fields', error });
  }
};
