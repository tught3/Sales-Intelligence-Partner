import { doctorStorage, visitLogStorage, type Doctor, type VisitLog } from '../storage';
import { collectKeys } from './detailKeys';

const VISIT_PRODUCTS = ['위너프에이플러스', '페린젝트'];

export type VisitContext = {
  doctor: Doctor;
  pastLogs: VisitLog[];
  recentStrategies: string[];
  usedProductsRecently: string[];
  availableProducts: string[];
  batchAvoidTexts: string[];
  batchUsedDetailKeys: string[];
  todayDate: string;
  manualRawNotes?: string;
  hasDailyObFerinject: boolean;
  isObDoctor: boolean;
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
  manualRawNotes?: string
): VisitContext {
  const sortedLogs = [...pastLogs].sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));
  const recentTexts = sortedLogs.slice(0, 5).flatMap((log) => [log.formattedLog, log.nextStrategy]);
  const selected = selectedProducts.filter((product) => VISIT_PRODUCTS.includes(product));

  const todayDate = new Date().toISOString().split('T')[0];

  return {
    doctor,
    pastLogs: sortedLogs,
    recentStrategies: sortedLogs.slice(0, 3).map((log) => log.nextStrategy).filter(Boolean),
    usedProductsRecently: [...new Set(sortedLogs.slice(0, 5).flatMap((log) => log.products || []))],
    availableProducts: selected.length > 0 ? selected : VISIT_PRODUCTS,
    batchAvoidTexts,
    batchUsedDetailKeys: collectKeys(batchAvoidTexts),
    todayDate,
    manualRawNotes,
    hasDailyObFerinject: hasTodayObFerinject(todayDate),
    isObDoctor: isObDepartment(doctor.department),
  };
}
