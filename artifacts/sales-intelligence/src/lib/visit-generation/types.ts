import type { Doctor, VisitLog } from '../storage';

export type GenerationMode = 'auto' | 'manual';

export type DetailKey = {
  product: string;
  patientGroup: string;
  detailAxis: string;
  doctorReaction: string;
  nextAction: string;
  selectionReason: string;
};

export type ValidationFailType =
  | 'DUPLICATE_BATCH'
  | 'DUPLICATE_PAST'
  | 'DUPLICATE_STRATEGY'
  | 'LENGTH_SHORT'
  | 'LENGTH_LONG'
  | 'MISSING_PRODUCT'
  | 'MISSING_DETAIL'
  | 'MISSING_REACTION';

export type ValidationResult =
  | { pass: true }
  | { pass: false; failTypes: ValidationFailType[]; details: string };

export type RepairTarget = {
  field: 'formattedLog' | 'nextStrategy' | 'both';
  reasons: ValidationFailType[];
};

export type TraceStep = {
  stage: string;
  input?: unknown;
  output?: unknown;
  note?: string;
  failTypes?: ValidationFailType[];
  timestamp: number;
};

export type PipelineTrace = {
  doctorId: string;
  steps: TraceStep[];
  finalStatus: 'success' | 'fallback' | 'error';
  totalMs: number;
};

export type GenerationResult = {
  formattedLog: string;
  nextStrategy: string;
  visitDate: string;
  products: string[];
  usedFallback: boolean;
  trace: PipelineTrace;
};

export type RawGenerationOutput = {
  formattedLog: string;
  nextStrategy: string;
  visitDate?: string;
  products?: string[];
};

export type VisitGenerationInput = {
  mode: GenerationMode;
  doctor: Doctor;
  pastLogs: VisitLog[];
  selectedProducts: string[];
  batchAvoidTexts: string[];
  manualRawNotes?: string;
};

export type VisitGenerationDependencies = {
  generateBase(input: VisitGenerationInput, plan: DetailKey): Promise<RawGenerationOutput>;
};
