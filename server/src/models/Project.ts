import mongoose, { Document, Schema } from 'mongoose';
import { customAlphabet } from 'nanoid';

const generateToken = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 10);

export interface IEtape {
  description?: string;
  suggestions?: string;
  ajustements?: string;
}

export interface IScene {
  nom?: string;
  etapes: IEtape[];
}

// Dynamic answers: each chatfield label stores its value here
export interface IAnswers {
  [key: string]: string | string[] | IScene[];
  scenes: IScene[];
}

// A single turn in the chatbot short-term history
export interface IChatTurn {
  role: 'user' | 'bot';
  content: string;
}

// A step row of a scenario built by the smart chatbot (Phase 2)
export interface IStepRow {
  numero: string;
  titre: string;
  action: string;
  resultat: string;
  objets3d: string;
  ui: string;
  animations: string;
  validation: string;
  statut: string;
  chatHistory?: IChatTurn[];
}

// Smart builder state kept on each scenario block
export interface IScenarioBuilder {
  state: 'collecting' | 'done';
  pendingStepIndex?: number | null;
  pendingFields?: string[] | null;
}

// A scenario block within the project (Phase 2)
export interface IScenarioBlock {
  name: string;
  currentField: number;
  chatHistory: IChatTurn[];
  answers: Record<string, any>;
  builder: IScenarioBuilder;
}

export interface IProject extends Document {
  title: string;
  status: 'draft' | 'in_progress' | 'completed';
  clientToken: string;
  createdBy?: mongoose.Types.ObjectId;
  phase: 'info' | 'review' | 'scenario' | 'completed';
  currentStep: number;
  infoChatHistory: IChatTurn[];
  answers: IAnswers;
  scenarios: IScenarioBlock[];
  uploadedFiles: string[];
  sheetUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EtapeSchema = new Schema<IEtape>({ description: String, suggestions: String, ajustements: String }, { _id: false });
const SceneSchema = new Schema<IScene>({ nom: String, etapes: [EtapeSchema] }, { _id: false });
const ChatTurnSchema = new Schema<IChatTurn>({ role: { type: String, enum: ['user', 'bot'] }, content: String }, { _id: false });

const ScenarioBlockSchema = new Schema<IScenarioBlock>(
  {
    name: { type: String, default: 'Nouveau scénario' },
    currentField: { type: Number, default: 0 },
    chatHistory: { type: [ChatTurnSchema], default: [] },
    answers: { type: Schema.Types.Mixed, default: () => ({}) },
    builder: {
      type: Schema.Types.Mixed,
      default: () => ({ state: 'collecting', pendingStepIndex: null, pendingFields: null }),
    },
  },
  { _id: true }
);

const ProjectSchema = new Schema<IProject>(
  {
    title: { type: String, required: true, trim: true },
    status: { type: String, enum: ['draft', 'in_progress', 'completed'], default: 'draft' },
    clientToken: { type: String, unique: true, default: () => generateToken() },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    phase: { type: String, enum: ['info', 'review', 'scenario', 'completed'], default: 'info' },
    currentStep: { type: Number, default: 0 },
    infoChatHistory: { type: [ChatTurnSchema], default: [] },
    answers: { type: Schema.Types.Mixed, default: () => ({ scenes: [] }) },
    scenarios: { type: [ScenarioBlockSchema], default: [] },
    uploadedFiles: { type: [String], default: [] },
    sheetUrl: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IProject>('Project', ProjectSchema);
