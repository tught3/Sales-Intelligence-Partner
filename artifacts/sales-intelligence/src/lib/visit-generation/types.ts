import type { Doctor, VisitLog } from '../storage';

export type GenerationMode = 'auto' | 'manual';

export type DetailKey = {
  product: string;
  patientGroup: string;
  detailAxis: string;
  doctorReaction: string;
  nextAction: string;
  narrativeStyle: '지난 방문 확인형' | '교수 질문 답변형' | '급여 기준 재확인형' | '환자 케이스 연결형' | '처방 경험 확인형';
  professorQuestion?: string;
  clinicalDomains?: string[];
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
  | 'MISSING_REACTION'
  | 'DEPARTMENT_MISMATCH'
  | 'FORBIDDEN_PHRASE';

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
