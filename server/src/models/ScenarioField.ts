import mongoose, { Document, Schema } from 'mongoose';

export type ScenarioFieldType = 'text' | 'radio' | 'checkbox';

export interface IScenarioField extends Document {
  key: string;
  label: string;
  description: string;
  forbidden: string;
  type: ScenarioFieldType;
  options: string[];
  required: boolean;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ScenarioFieldSchema = new Schema<IScenarioField>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    forbidden: { type: String, default: '', trim: true },
    type: { type: String, enum: ['text', 'radio', 'checkbox'], default: 'text' },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IScenarioField>('ScenarioField', ScenarioFieldSchema);
