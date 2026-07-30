import mongoose, { Document, Schema } from 'mongoose';

export type ChatFieldType = 'text' | 'radio' | 'checkbox';

export interface IChatField extends Document {
  label: string;
  description: string;
  type: ChatFieldType;
  options: string[];
  required: boolean;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChatFieldSchema = new Schema<IChatField>(
  {
    label: {
      type: String,
      required: [true, 'Field label is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'radio', 'checkbox'],
      default: 'text',
    },
    options: {
      type: [String],
      default: [],
    },
    required: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IChatField>('ChatField', ChatFieldSchema);
