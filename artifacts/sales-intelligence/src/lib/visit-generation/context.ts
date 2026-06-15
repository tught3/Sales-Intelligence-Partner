import {
  doctorStorage,
  externalCasePatternStorage,
  preferenceStorage,
  visitLogStorage,
  type AiGenerationPreference,
  type Doctor,
  type ExternalCasePattern,
  type VisitLog,
} from '../storage';
import { collectKeys, collectReactionKeys } from './detailKeys';

const VISIT_PRODUCTS = ['위너프에이플러스', '페린젝트', '플라주OP'];

export type VisitContext = {
  doctor: Doctor;
  pastLogs: VisitLog[];
  recentStrategies: string[];
  usedProductsRecently: string[];
  batchUsedProducts: string[];
  batchUsedTemplateIds: string[];
  availableProducts: string[];
  batchAvoidTexts: string[];
  batchUsedDetailKeys: string[];
  batchUsedReactionKeys: string[];
  todayDate: string;
  manualRawNotes?: string;
  hasDailyObFerinject: boolean;
  isObDoctor: boolean;
  preferences: AiGenerationPreference[];
  learnedForbiddenPatterns: string[];
  learnedPreferredPatterns: string[];
  manualFactKeys: string[];
  externalCasePatterns: ExternalCasePattern[];
};

function isObDepartment(department: string): boolean {
  return /산부인과|부인과|ob|obgy|obgyn/i.test(department);
}

function hasTodayObFerinject(todayDate: string): boolean {
  const doctors = doctorStorage.getAll();
  return visitLogStorage.getAll().some((log) => {
    if (log.visitDate !== todayDate) return false;
    if (!log.products?.includes('페린젝트') && !log.formattedLog.includes('페린젝트')) return false;
    const doctor = doctors.find((item) => item.id === log.doctorId);
    return doctor ? isObDepartment(doctor.department) : false;
  });
}

export function buildContext(
  doctor: Doctor,
  pastLogs: VisitLog[],
  selectedProducts: string[],
  batchAvoidTexts: string[],
  batchUsedTemplateIds: string[] = [],
  batchUsedProducts: string[] = [],
  manualRawNotes?: string
): VisitContext {
  const sortedLogs = [...pastLogs].sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));
  const recentTexts = sortedLogs.slice(0, 5).flatMap((log) => [log.formattedLog, log.nextStrategy]);
  const selected = selectedProducts.filter((product) => VISIT_PRODUCTS.includes(product));
  const detectedManualProducts = manualRawNotes
    ? VISIT_PRODUCTS.filter((product) => manualRawNotes.replace(/\s+/g, '').includes(product.replace(/\s+/g, '')))
    : [];
  const productScope = selected.length > 0 ? selected : detectedManualProducts;
  const preferences = preferenceStorage.getForGeneration(doctor, productScope);
  const externalCasePatterns = externalCasePatternStorage.getForGeneration(
    doctor.department,
    productScope.length > 0 ? productScope : VISIT_PRODUCTS
  );

  const todayDate = new Date().toISOString().split('T')[0];
  const todayReactionTexts = manualRawNotes
    ? []
    : visitLogStorage
        .getAll()
        .filter((log) => log.visitDate === todayDate)
        .map((log) => `${log.formattedLog} ${log.nextStrategy ?? ''}`);
  const reactionAvoidTexts = [...batchAvoidTexts, ...todayReactionTexts];

  return {
    doctor,
    pastLogs: sortedLogs,
    recentStrategies: sortedLogs.slice(0, 3).map((log) => log.nextStrategy).filter(Boolean),
    usedProductsRecently: [...new Set(sortedLogs.slice(0, 5).flatMap((log) => log.products || []))],
    batchUsedProducts,
    batchUsedTemplateIds,
    availableProducts: selected.length > 0 ? selected : VISIT_PRODUCTS,
    batchAvoidTexts,
    batchUsedDetailKeys: collectKeys(batchAvoidTexts),
    batchUsedReactionKeys: collectReactionKeys(reactionAvoidTexts),
    todayDate,
    manualRawNotes,
    hasDailyObFerinject: hasTodayObFerinject(todayDate),
    isObDoctor: isObDepartment(doctor.department),
    preferences,
    learnedForbiddenPatterns: [...new Set(preferences.flatMap((pref) => pref.forbiddenPatterns ?? []))].slice(0, 20),
    learnedPreferredPatterns: [...new Set(preferences.flatMap((pref) => pref.preferredPatterns ?? []))].slice(0, 20),
    manualFactKeys: collectKeys([manualRawNotes ?? '']),
    externalCasePatterns,
  };
}
