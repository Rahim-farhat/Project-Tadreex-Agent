import mongoose, { Document, Schema } from "mongoose";

export interface ISettings extends Document {
  groqModelStrong: string;
  groqModelFast: string;
  groqTemperature: number;
  groqFastTemperature: number;
}

const SettingsSchema = new Schema<ISettings>(
  {
    groqModelStrong: { type: String, default: "openai/gpt-oss-120b" },
    groqModelFast: { type: String, default: "openai/gpt-oss-20b" },
    groqTemperature: { type: Number, default: 0.1 },
    groqFastTemperature: { type: Number, default: 0.2 },
  },
  { timestamps: true },
);

export default mongoose.model<ISettings>("Settings", SettingsSchema);
