import mongoose, { Document, Schema } from 'mongoose';

export type ScenarioFieldType = 'text' | 'radio' | 'checkbox';

export interface IScenarioField extends Document {
  label: string;
  description: string;
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
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    type: { type: String, enum: ['text', 'radio', 'checkbox'], default: 'text' },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IScenarioField>('ScenarioField', ScenarioFieldSchema);
