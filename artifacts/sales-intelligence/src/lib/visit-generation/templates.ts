import type { DetailKey } from './types';

export type VisitTemplate = {
  templateId: string;
  department: string;
  product: string;
  patientGroup: string;
  detailAxis: string;
  doctorReaction: string;
  nextAxis: string;
  narrativeStyle: DetailKey['narrativeStyle'];
};

const VISIT_TEMPLATES: VisitTemplate[] = [
  {
    templateId: 'winuf-or-mix-01',
    department: '공통',
    product: '위너프에이플러스',
    patientGroup: '수술 후 회복기에서 식사 진행이 늦은 환자',
    detailAxis: '위너프에이플러스의 단백 보충과 질소균형 유지',
    doctorReaction: '회복기 영양 보충은 이해하셨고 환자 흐름을 보고 보겠다는 의견',
    nextAxis: '수술 후 회복기 환자에서 영양 공급 반응 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    templateId: 'winuf-gly-01',
    department: '공통',
    product: '위너프에이플러스',
    patientGroup: '수술 후 혈당 변동을 같이 보는 환자',
    detailAxis: '위너프에이플러스의 포도당 부담 감소와 혈당 흐름',
    doctorReaction: '혈당 부담 차이는 공감하셨고 실제 적용은 차트상 환자부터 보겠다는 반응',
    nextAxis: '혈당 부담 차이와 회복기 적용 가능 케이스 확인',
    narrativeStyle: '급여 기준 재확인형',
  },
  {
    templateId: 'winuf-omega-01',
    department: '공통',
    product: '위너프에이플러스',
    patientGroup: '회복기 식사량 저하가 있는 환자',
    detailAxis: '위너프에이플러스의 오메가3 조성과 균형 영양',
    doctorReaction: '영양 균형은 이해하셨고 환자 상태에 맞춰 보겠다는 의견',
    nextAxis: '회복기 식사량 저하 환자에서 영양 반응 확인',
    narrativeStyle: '처방 경험 확인형',
  },
  {
    templateId: 'winuf-surgery-01',
    department: '외과',
    product: '위너프에이플러스',
    patientGroup: '수술 후 식이 지연이 있는 외과 회복기 환자',
    detailAxis: '위너프에이플러스의 회복기 영양 공급과 단백 보충',
    doctorReaction: '회복기에는 영양 흐름을 같이 보겠다는 반응',
    nextAxis: '수술 후 식이 지연 환자에서 실제 영양 반응 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    templateId: 'winuf-ortho-01',
    department: '정형외과',
    product: '위너프에이플러스',
    patientGroup: '재활 초기로 식사 진행이 더딘 정형외과 환자',
    detailAxis: '위너프에이플러스의 단백 보충과 회복기 영양',
    doctorReaction: '재활 초기 환자에서는 참고해보겠다는 의견',
    nextAxis: '재활 초기 환자에서 영양 반응과 처방 흐름 확인',
    narrativeStyle: '처방 경험 확인형',
  },
  {
    templateId: 'winuf-ob-01',
    department: '산부인과',
    product: '위너프에이플러스',
    patientGroup: '분만 후 회복기나 수술 전후 식이 진행이 늦은 환자',
    detailAxis: '위너프에이플러스의 회복기 영양 공급과 혈당 부담 차이',
    doctorReaction: '회복기 영양은 공감하셨고 환자 흐름을 보겠다는 의견',
    nextAxis: '분만 후 회복기 환자에서 영양 공급 반응 확인',
    narrativeStyle: '지난 방문 확인형',
  },
  {
    templateId: 'winuf-gi-01',
    department: '소화기내과',
    product: '위너프에이플러스',
    patientGroup: '식사량 저하가 있어 영양 보충을 같이 보는 소화기내과 환자',
    detailAxis: '위너프에이플러스의 아미노산 조성과 포도당 부담 차이',
    doctorReaction: '영양 보충 필요성은 공감하셨고 실제 적용은 환자 상태를 보고 보겠다는 의견',
    nextAxis: '식사량 저하 환자에서 영양 반응과 처방 가능성 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    templateId: 'winuf-onco-01',
    department: '종양내과',
    product: '위너프에이플러스',
    patientGroup: '암환자에서 식사량 저하와 영양 보충이 같이 필요한 경우',
    detailAxis: '위너프에이플러스의 단백 보충과 영양 흐름',
    doctorReaction: '영양 보충은 이해하셨고 환자 상태에 맞춰 보겠다는 반응',
    nextAxis: '암환자 식사량 저하에서 영양 반응 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    templateId: 'ferinject-outpatient-01',
    department: '공통',
    product: '페린젝트',
    patientGroup: '외래 재방문이 부담돼 한 번에 철 보충을 보는 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '반복 내원이 어려운 환자에서는 설명해볼 수 있겠다는 반응',
    nextAxis: '외래 빈혈 환자에서 급여 기준과 Hb 회복 경과 확인',
    narrativeStyle: '처방 경험 확인형',
  },
  {
    templateId: 'ferinject-gi-01',
    department: '소화기내과',
    product: '페린젝트',
    patientGroup: '위장관 출혈 이후 경구용철분제로 Hb 회복이 더딘 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '경구용철분제로는 회복이 더딜 수 있어 차트로 보겠다는 의견',
    nextAxis: '위장관 출혈 뒤 Hb 회복과 급여 기준 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    templateId: 'ferinject-onco-01',
    department: '종양내과',
    product: '페린젝트',
    patientGroup: '항암치료 중 햅시딘 상승과 경구용철분제 흡수 저하가 있는 환자',
    detailAxis: '페린젝트의 1회 투여와 빠른 Hb 회복 근거',
    doctorReaction: '경구용철분제 반응이 부족한 환자는 차트로 보겠다는 의견',
    nextAxis: '항암 전후 빈혈에서 급여 기준과 처방 경험 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    templateId: 'ferinject-ob-01',
    department: '산부인과',
    product: '페린젝트',
    patientGroup: '분만 후 빈혈이나 부인과 수술 전후 Hb 회복을 보는 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 시험투여 부담이 적은 점',
    doctorReaction: '산후 외래가 잦지 않은 환자에서는 편의성을 인정하신 것으로 보임',
    nextAxis: '산후 회복기 환자에서 외래 추이와 급여 기준 확인',
    narrativeStyle: '지난 방문 확인형',
  },
  {
    templateId: 'ferinject-surgery-01',
    department: '외과',
    product: '페린젝트',
    patientGroup: '수술 전후 Hb 회복을 빨리 봐야 하는 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 수혈 부담 감소',
    doctorReaction: '수술 일정이 임박한 환자는 검토해보겠다는 의견',
    nextAxis: '수술 전후 빈혈에서 적용 가능 케이스 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    templateId: 'ferinject-ortho-01',
    department: '정형외과',
    product: '페린젝트',
    patientGroup: '수술 전 Hb 교정이 필요한 정형외과 환자',
    detailAxis: '페린젝트의 1회 투여와 Hb 회복 근거',
    doctorReaction: '수술 전 환자에서는 차트상 조건을 보겠다는 반응',
    nextAxis: '수술 전 환자에서 처방 가능성과 Hb 추이 확인',
    narrativeStyle: '급여 기준 재확인형',
  },
  {
    templateId: 'ferinject-heart-01',
    department: '흉부외과',
    product: '페린젝트',
    patientGroup: '수술 전후 빈혈이나 수혈 부담이 있는 흉부외과 환자',
    detailAxis: '페린젝트의 수혈 부담 감소와 1회 투여 이점',
    doctorReaction: '수술 후 회복기에서는 편의성은 이해하셨다는 의견',
    nextAxis: '수술 후 빈혈 환자에서 Hb 회복 경과 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    templateId: 'ferinject-critical-01',
    department: '중환자의학과',
    product: '페린젝트',
    patientGroup: '장기 입원이나 중증 감염 후 빈혈이 남아 있는 환자',
    detailAxis: '페린젝트의 1회 투여와 빠른 Hb 회복 근거',
    doctorReaction: '중증 환자에서는 차트상 조건을 보겠다는 의견',
    nextAxis: '중증 입원 환자에서 Hb 회복 경과 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    templateId: 'ferinject-heme-01',
    department: '혈액종양내과',
    product: '페린젝트',
    patientGroup: '항암치료 중 Hb 회복이 더딘 외래 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여와 Hb 회복 근거',
    doctorReaction: '외래 일정이 빡빡한 환자는 차트로 보겠다는 의견',
    nextAxis: '항암 전후 빈혈에서 외래 처방 가능성 확인',
    narrativeStyle: '처방 경험 확인형',
  },
  {
    templateId: 'ferinject-cv-01',
    department: '심장내과',
    product: '페린젝트',
    patientGroup: '심부전 동반 빈혈로 철 보충을 같이 보는 환자',
    detailAxis: '페린젝트의 수혈 부담 감소와 Hb 회복 근거',
    doctorReaction: '심기능과 같이 보겠다는 의견',
    nextAxis: '심부전 동반 빈혈에서 적용 가능 케이스 확인',
    narrativeStyle: '급여 기준 재확인형',
  },
];

function departmentMatches(templateDepartment: string, department: string): boolean {
  if (templateDepartment === '공통') return true;
  const compactTemplate = templateDepartment.replace(/\s+/g, '');
  const compactDepartment = department.replace(/\s+/g, '');
  return compactDepartment.includes(compactTemplate) || compactTemplate.includes(compactDepartment);
}

export function getVisitTemplates(department: string, products: string[]): VisitTemplate[] {
  const normalizedProducts = products.length > 0 ? products : ['위너프에이플러스', '페린젝트'];
  return VISIT_TEMPLATES.filter((template) => normalizedProducts.includes(template.product) && departmentMatches(template.department, department));
}

export function getVisitTemplateById(templateId: string): VisitTemplate | undefined {
  return VISIT_TEMPLATES.find((template) => template.templateId === templateId);
}

export function getAllVisitTemplates(): VisitTemplate[] {
  return [...VISIT_TEMPLATES];
}
