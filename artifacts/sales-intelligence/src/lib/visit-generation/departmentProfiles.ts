import type { DetailKey } from './types';

type ProductName = '위너프에이플러스' | '페린젝트' | '플라주OP';

export type DepartmentProfile = {
  key: string;
  label: string;
  matchers: RegExp[];
  allowedContext: RegExp;
  forbiddenContext: RegExp;
  fallback: Record<ProductName, {
    patientGroup: string;
    detailAxis: string;
    nextAction: string;
    formattedLog: string;
    nextStrategy: string;
  }>;
};

const DEFAULT_PRODUCT: ProductName = '위너프에이플러스';

const GENERAL_FORBIDDEN = /산후|분만|산모|제왕절개|부인과|IBD|크론|궤양성\s*대장염|위장관\s*출혈|대장암|직장암|항문\s*수술|췌장|담낭|담도|위암|위\s*절제|폐암|COPD|폐렴|호흡\s*재활|뇌수술|척추수술|항암|CIA|EPO|암환자/;

function fallbackSet(base: {
  winuf: [string, string, string, string, string];
  ferinject: [string, string, string, string, string];
  plaju?: [string, string, string, string, string];
}): DepartmentProfile['fallback'] {
  return {
    위너프에이플러스: {
      patientGroup: base.winuf[0],
      detailAxis: base.winuf[1],
      nextAction: base.winuf[2],
      formattedLog: base.winuf[3],
      nextStrategy: base.winuf[4],
    },
    페린젝트: {
      patientGroup: base.ferinject[0],
      detailAxis: base.ferinject[1],
      nextAction: base.ferinject[2],
      formattedLog: base.ferinject[3],
      nextStrategy: base.ferinject[4],
    },
    플라주OP: {
      patientGroup: (base.plaju ?? base.winuf)[0],
      detailAxis: (base.plaju ?? base.winuf)[1].replace('위너프에이플러스', '플라주OP'),
      nextAction: (base.plaju ?? base.winuf)[2],
      formattedLog: (base.plaju ?? base.winuf)[3].replace(/위너프에이플러스/g, '플라주OP'),
      nextStrategy: (base.plaju ?? base.winuf)[4],
    },
  };
}

export const departmentProfiles: DepartmentProfile[] = [
  {
    key: 'colorectal_surgery',
    label: '대장항문외과',
    matchers: [/대장\s*항문|대장항문외과|결장|직장|항문/i],
    allowedContext: /대장암|직장암|항문\s*수술|결장|직장\s*절제|대장\s*수술/,
    forbiddenContext: /산후|분만|산모|제왕절개|폐암|COPD|폐렴|뇌수술|척추수술|췌장|담낭|담도|위암|위\s*절제/,
    fallback: fallbackSet({
      winuf: [
        '결장·직장 절제 후 식이 진행이 늦은 회복기 환자',
        '위너프에이플러스의 대장암 수술 후 단백 보충과 회복기 영양',
        '결장·직장 절제 후 식이 재개와 단백 보충 반응 확인',
        '위너프에이플러스 단백 보충을 결장·직장 절제 후 식이 진행이 늦은 환자 상황에 맞춰 말씀드림. 교수님께서 대장암 수술 후 회복기에는 영양 공급이 중요하다는 반응 보임',
        '다음방문시에는 결장·직장 절제 후 식이 재개와 단백 보충 반응 확인할예정',
      ],
      ferinject: [
        '대장암·직장암 수술 전후 Hb 교정이 필요한 빈혈 환자',
        '페린젝트의 대장암 수술 전후 빈혈 교정과 1회 투여 편의성',
        '대장암·직장암 수술 전후 빈혈 환자의 Hb 추이 확인',
        '페린젝트 1회 투여를 대장암·직장암 수술 전후 Hb 교정이 필요한 환자 상황에 맞춰 말씀드림. 교수님께서 수술 전후 빈혈 교정은 필요 케이스부터 보겠다는 반응 보임',
        '다음방문시에는 대장암·직장암 수술 전후 빈혈 환자의 Hb 추이 확인할예정',
      ],
    }),
  },
  {
    key: 'hpb_surgery',
    label: '간담췌외과',
    matchers: [/간담췌|췌담도|간담도|췌장|담낭|담도/i],
    allowedContext: /간\s*수술|담낭|담도|췌장|간담췌|췌담도/,
    forbiddenContext: /산후|분만|산모|제왕절개|폐암|COPD|폐렴|뇌수술|척추수술|대장암|직장암|항문|위암|위\s*절제/,
    fallback: fallbackSet({
      winuf: [
        '췌장·담낭 수술 후 식이 진행이 늦은 회복기 환자',
        '위너프에이플러스의 췌장·담낭 수술 후 단백 보충과 회복기 영양',
        '췌장·담낭 수술 후 식이 재개와 영양 공급 반응 확인',
        '위너프에이플러스 단백 보충을 췌장·담낭 수술 후 식이 진행이 늦은 환자 상황에 맞춰 말씀드림. 교수님께서 간담췌 수술 후 회복기 영양은 환자 상태에 맞춰 보겠다는 반응 보임',
        '다음방문시에는 췌장·담낭 수술 후 식이 재개와 영양 공급 반응 확인할예정',
      ],
      ferinject: [
        '췌장·담낭 수술 전후 Hb 교정이 필요한 빈혈 환자',
        '페린젝트의 간담췌 수술 전후 빈혈 교정과 수혈 부담 감소',
        '췌장·담낭 수술 전후 빈혈 환자의 Hb 추이 확인',
        '페린젝트 1회 투여를 췌장·담낭 수술 전후 Hb 교정이 필요한 환자 상황에 맞춰 말씀드림. 교수님께서 수혈 부담을 줄일 수 있는 케이스부터 보겠다는 반응 보임',
        '다음방문시에는 췌장·담낭 수술 전후 빈혈 환자의 Hb 추이 확인할예정',
      ],
    }),
  },
  {
    key: 'gastric_surgery',
    label: '위장관외과',
    matchers: [/위장관외과|위\s*장관\s*외과|위암|위\s*절제/i],
    allowedContext: /위암|위\s*절제|위장관\s*수술|위\s*수술/,
    forbiddenContext: /산후|분만|산모|제왕절개|폐암|COPD|폐렴|뇌수술|척추수술|대장암|직장암|췌장|담낭|담도/,
    fallback: fallbackSet({
      winuf: [
        '위암·위 절제 후 식이 진행이 늦은 회복기 환자',
        '위너프에이플러스의 위암 수술 후 단백 보충과 회복기 영양',
        '위암·위 절제 후 식이 재개와 영양 공급 반응 확인',
        '위너프에이플러스 단백 보충을 위암·위 절제 후 식이 진행이 늦은 환자 상황에 맞춰 말씀드림. 교수님께서 위장관 수술 후 영양 공급은 회복 흐름에 맞춰 보겠다는 반응 보임',
        '다음방문시에는 위암·위 절제 후 식이 재개와 영양 공급 반응 확인할예정',
      ],
      ferinject: [
        '위암·위 절제 전후 Hb 교정이 필요한 빈혈 환자',
        '페린젝트의 위장관 수술 전후 빈혈 교정과 Hb 회복 근거',
        '위암·위 절제 전후 빈혈 환자의 Hb 추이 확인',
        '페린젝트 1회 투여를 위암·위 절제 전후 Hb 교정이 필요한 환자 상황에 맞춰 말씀드림. 교수님께서 수술 전후 빈혈 교정은 기준이 맞는 환자부터 보겠다는 반응 보임',
        '다음방문시에는 위암·위 절제 전후 빈혈 환자의 Hb 추이 확인할예정',
      ],
    }),
  },
  {
    key: 'obgyn',
    label: '산부인과',
    matchers: [/산부인과|산과|부인과|obgy|obgyn/i],
    allowedContext: /산후|분만|제왕절개|부인과\s*수술|산모\s*빈혈|고위험\s*산모|자궁/,
    forbiddenContext: /IBD|크론|궤양성\s*대장염|위장관\s*출혈|폐암|COPD|폐렴|뇌수술|척추수술|대장암|직장암|췌장|담낭|위암/,
    fallback: fallbackSet({
      winuf: [
        '부인과 수술 후 식이 진행이 늦은 회복기 환자',
        '위너프에이플러스의 부인과 수술 후 단백 보충과 회복기 영양',
        '부인과 수술 후 식이 재개와 영양 공급 반응 확인',
        '위너프에이플러스 단백 보충을 부인과 수술 후 식이 진행이 늦은 환자 상황에 맞춰 말씀드림. 교수님께서 회복기 영양 공급은 환자 상태에 맞춰 보겠다는 반응 보임',
        '다음방문시에는 부인과 수술 후 식이 재개와 영양 공급 반응 확인할예정',
      ],
      ferinject: [
        '산후 빈혈이나 부인과 수술 전후 Hb 교정이 필요한 환자',
        '페린젝트의 산후·부인과 수술 전후 빈혈 교정과 1회 투여',
        '산후·부인과 수술 전후 빈혈 환자의 Hb 추이 확인',
        '페린젝트 1회 투여를 산후 빈혈이나 부인과 수술 전후 Hb 교정이 필요한 환자 상황에 맞춰 말씀드림. 교수님께서 출혈량이 많은 산모부터 우선순위를 보겠다는 반응 보임',
        '다음방문시에는 산후·부인과 수술 전후 빈혈 환자의 Hb 추이 확인할예정',
      ],
    }),
  },
  {
    key: 'orthopedics',
    label: '정형외과',
    matchers: [/정형외과|ortho|TKR|THR|슬관절|고관절|관절|골절/i],
    allowedContext: /TKR|THR|슬관절|고관절|관절\s*치환|골절|정형외과\s*수술|보행\s*재개|재활/,
    forbiddenContext: /산후|분만|산모|제왕절개|부인과|IBD|크론|궤양성\s*대장염|위장관\s*출혈|폐암|COPD|폐렴|뇌수술|췌장|담낭|위암|위\s*절제/,
    fallback: fallbackSet({
      winuf: [
        'TKR·THR 후 보행 재개가 늦고 식사량이 줄어든 회복기 환자',
        '위너프에이플러스의 정형외과 수술 후 단백 보충과 회복기 영양',
        'TKR·THR 후 보행 재개 환자의 식사량과 영양 반응 확인',
        '위너프에이플러스 단백 보충을 TKR·THR 후 보행 재개가 늦고 식사량이 줄어든 환자 상황에 맞춰 말씀드림. 교수님께서 정형외과 수술 후 영양은 재활 속도와 같이 보겠다는 반응 보임',
        '다음방문시에는 TKR·THR 후 보행 재개 환자의 식사량과 영양 반응 확인할예정',
      ],
      ferinject: [
        'TKR·THR 전후 Hb 교정이 필요한 빈혈 환자',
        '페린젝트의 정형외과 수술 전후 빈혈 교정과 수혈 부담 감소',
        'TKR·THR 전후 빈혈 환자의 Hb 추이와 재원 흐름 확인',
        '페린젝트 1회 투여를 TKR·THR 전후 Hb 교정이 필요한 빈혈 환자 상황에 맞춰 말씀드림. 교수님께서 저혈량 위험 환자는 수혈 기준과 Hb 추이를 같이 보겠다는 반응 보임',
        '다음방문시에는 TKR·THR 전후 빈혈 환자의 Hb 추이와 재원 흐름 확인할예정',
      ],
    }),
  },
  {
    key: 'oncology',
    label: '종양내과',
    matchers: [/혈액\s*종양|혈종|종양혈액|종양내과|혈액내과|항암|oncology/i],
    allowedContext: /암환자|항암|CIA|EPO|암\s*수술|종양|햅시딘|항암치료/,
    forbiddenContext: /산후|분만|산모|제왕절개|부인과|IBD|크론|궤양성\s*대장염|위장관\s*출혈|COPD|폐렴|뇌수술|척추수술|대장암|직장암|췌장|담낭|위암|위\s*절제/,
    fallback: fallbackSet({
      winuf: [
        '항암치료 중 식사량 저하와 단백 보충이 필요한 암환자',
        '위너프에이플러스의 암환자 회복기 단백 보충과 영양 공급',
        '항암 병동 암환자의 식사량과 영양 반응 확인',
        '위너프에이플러스 단백 보충을 항암치료 중 식사량이 떨어진 암환자 상황에 맞춰 말씀드림. 교수님께서 암환자 영양 공급은 병동 상태에 맞춰 검토하겠다는 반응 보임',
        '다음방문시에는 항암 병동 암환자의 식사량과 영양 반응 확인할예정',
      ],
      ferinject: [
        '항암치료 중 Hb 회복이 필요한 암환자 빈혈 케이스',
        '페린젝트의 CIA·EPO 저항 환자에서 정맥철 보충 근거',
        '항암 전후 암환자 빈혈에서 Hb 추이와 철결핍 기준 확인',
        '페린젝트 1회 투여를 항암치료 중 Hb 회복이 필요한 암환자 빈혈 케이스와 연결해 말씀드림. 교수님께서 CIA나 EPO 저항 환자는 기준이 맞으면 보겠다는 반응 보임',
        '다음방문시에는 항암 전후 암환자 빈혈에서 Hb 추이와 철결핍 기준 확인할예정',
      ],
    }),
  },
  {
    key: 'neurosurgery',
    label: '신경외과',
    matchers: [/신경외과|neuro|뇌수술|척추수술|척추\s*수술/i],
    allowedContext: /뇌수술|척추수술|신경외과\s*수술|장기\s*재원|척추|뇌\s*수술/,
    forbiddenContext: /산후|분만|산모|제왕절개|부인과|IBD|크론|궤양성\s*대장염|위장관\s*출혈|폐암|COPD|폐렴|대장암|직장암|췌장|담낭|위암|위\s*절제/,
    fallback: fallbackSet({
      winuf: [
        '뇌수술·척추수술 후 장기 재원으로 영양 보충이 필요한 환자',
        '위너프에이플러스의 신경외과 수술 후 단백 보충과 회복기 영양',
        '뇌수술·척추수술 후 장기 재원 환자의 영양 공급 반응 확인',
        '위너프에이플러스 단백 보충을 뇌수술·척추수술 후 장기 재원으로 식사량이 줄어든 환자 상황에 맞춰 말씀드림. 교수님께서 신경외과 수술 후 영양 관리는 회복 흐름에 맞춰 보겠다는 반응 보임',
        '다음방문시에는 뇌수술·척추수술 후 장기 재원 환자의 영양 공급 반응 확인할예정',
      ],
      ferinject: [
        '뇌수술·척추수술 전후 Hb 교정이 필요한 빈혈 환자',
        '페린젝트의 신경외과 수술 전후 빈혈 교정과 수혈 부담 감소',
        '뇌수술·척추수술 전후 빈혈 환자의 Hb 추이 확인',
        '페린젝트 1회 투여를 뇌수술·척추수술 전후 Hb 교정이 필요한 환자 상황에 맞춰 말씀드림. 교수님께서 신경외과 수술 전후 빈혈 교정은 필요한 케이스부터 보겠다는 반응 보임',
        '다음방문시에는 뇌수술·척추수술 전후 빈혈 환자의 Hb 추이 확인할예정',
      ],
    }),
  },
  {
    key: 'pulmonology',
    label: '호흡기내과',
    matchers: [/호흡기|호흡|pulmo|폐암|COPD|폐렴/i],
    allowedContext: /폐암|COPD|폐렴|호흡\s*재활|호흡기\s*중환자|호흡기/,
    forbiddenContext: /산후|분만|산모|제왕절개|부인과|IBD|크론|궤양성\s*대장염|위장관\s*출혈|뇌수술|척추수술|대장암|직장암|췌장|담낭|위암|위\s*절제/,
    fallback: fallbackSet({
      winuf: [
        '폐렴 후 호흡 재활 중 식사량이 줄어든 환자',
        '위너프에이플러스의 호흡 재활 환자 단백 보충과 영양 공급',
        '폐렴 후 호흡 재활 환자의 식사량과 영양 반응 확인',
        '위너프에이플러스 단백 보충을 폐렴 후 호흡 재활 중 식사량이 줄어든 환자 상황에 맞춰 말씀드림. 교수님께서 호흡기 환자는 영양 상태가 회복에 중요하다는 반응 보임',
        '다음방문시에는 폐렴 후 호흡 재활 환자의 식사량과 영양 반응 확인할예정',
      ],
      ferinject: [
        '폐암 치료 중 Hb 회복이 필요한 빈혈 환자',
        '페린젝트의 폐암 치료 중 빈혈 교정과 Hb 회복 근거',
        '폐암 치료 중 빈혈 환자의 Hb 추이 확인',
        '페린젝트 1회 투여를 폐암 치료 중 Hb 회복이 필요한 빈혈 환자 상황에 맞춰 말씀드림. 교수님께서 호흡기 환자는 전신상태와 빈혈 교정을 같이 보겠다는 반응 보임',
        '다음방문시에는 폐암 치료 중 빈혈 환자의 Hb 추이 확인할예정',
      ],
    }),
  },
  {
    key: 'critical_care',
    label: '중환자의학과',
    matchers: [/응급외상중환자|중환자|ICU|외상|패혈증/i],
    allowedContext: /ICU|중환자|외상|패혈증|수혈|중환자\s*영양/,
    forbiddenContext: /산후|분만|산모|제왕절개|부인과|IBD|크론|궤양성\s*대장염|위장관\s*출혈|대장암|직장암|췌장|담낭|위암|위\s*절제/,
    fallback: fallbackSet({
      winuf: [
        'ICU 장기 재원 중 단백 보충과 혈당 부담을 같이 보는 중환자',
        '위너프에이플러스의 중환자 영양 공급과 단백 보충 이점',
        'ICU 중환자의 영양 공급량과 혈당 흐름 확인',
        '위너프에이플러스 단백 보충을 ICU 장기 재원 중 영양 공급이 부족한 중환자 상황에 맞춰 말씀드림. 교수님께서 중환자 영양은 혈당과 공급량을 같이 보겠다는 반응 보임',
        '다음방문시에는 ICU 중환자의 영양 공급량과 혈당 흐름 확인할예정',
      ],
      ferinject: [
        '외상·패혈증 치료 중 수혈 부담을 같이 보는 빈혈 환자',
        '페린젝트의 중환자 빈혈 교정과 수혈 부담 감소',
        '외상·패혈증 중환자의 수혈량과 Hb 추이 확인',
        '페린젝트 1회 투여를 외상·패혈증 치료 중 수혈 부담을 같이 보는 빈혈 환자 상황에 맞춰 말씀드림. 교수님께서 중환자는 수혈 기준과 Hb 추이를 같이 보겠다는 반응 보임',
        '다음방문시에는 외상·패혈증 중환자의 수혈량과 Hb 추이 확인할예정',
      ],
      plaju: [
        'ICU 수술 전후 수액 프로토콜을 조정하는 환자',
        '플라주OP의 수술 전후 수액 운용과 전해질 관리',
        'ICU 수액 프로토콜 적용 환자의 투여 흐름 확인',
        '플라주OP 수액 운용을 ICU 수술 전후 전해질 관리가 필요한 환자 상황에 맞춰 말씀드림. 교수님께서 중환자 수액은 프로토콜에 맞는 케이스부터 보겠다는 반응 보임',
        '다음방문시에는 ICU 수액 프로토콜 적용 환자의 투여 흐름 확인할예정',
      ],
    }),
  },
  {
    key: 'gastroenterology',
    label: '소화기내과',
    matchers: [/소화기|IBD|크론|궤양성|위장관\s*출혈|내시경/i],
    allowedContext: /IBD|크론|궤양성\s*대장염|위장관\s*출혈|내시경\s*지혈|소화기/,
    forbiddenContext: /산후|분만|산모|제왕절개|부인과|폐암|COPD|폐렴|뇌수술|척추수술|대장암|직장암|췌장|담낭|위암|위\s*절제/,
    fallback: fallbackSet({
      winuf: [
        'IBD 악화나 식사량 저하로 영양 보충이 필요한 환자',
        '위너프에이플러스의 IBD 환자 단백 보충과 회복기 영양',
        'IBD 환자의 식사량과 영양 보충 반응 확인',
        '위너프에이플러스 단백 보충을 IBD 악화로 식사량이 줄어든 환자 상황에 맞춰 말씀드림. 교수님께서 소화기 환자는 식사량과 영양 상태를 같이 보겠다는 반응 보임',
        '다음방문시에는 IBD 환자의 식사량과 영양 보충 반응 확인할예정',
      ],
      ferinject: [
        '위장관 출혈 후 Hb 회복이 더딘 외래 빈혈 환자',
        '페린젝트의 위장관 출혈 후 Hb 회복과 1회 투여 편의성',
        '위장관 출혈 후 외래 복귀 환자의 Hb 추이 확인',
        '페린젝트 1회 투여를 위장관 출혈 후 Hb 회복이 더딘 외래 빈혈 환자 상황에 맞춰 말씀드림. 교수님께서 내시경 지혈 후 회복기 환자는 급여 기준에 맞춰 보겠다는 반응 보임',
        '다음방문시에는 위장관 출혈 후 외래 복귀 환자의 Hb 추이 확인할예정',
      ],
    }),
  },
];

export function normalizeVisitProduct(product: string): ProductName {
  const compacted = product.replace(/\s+/g, '');
  if (compacted.includes('페린젝트')) return '페린젝트';
  if (compacted.includes('플라주OP') || compacted.includes('플라주오피')) return '플라주OP';
  if (compacted.includes('위너프')) return '위너프에이플러스';
  return DEFAULT_PRODUCT;
}

export function getDepartmentProfile(department: string): DepartmentProfile | undefined {
  const text = department || '';
  return departmentProfiles.find((profile) => profile.matchers.some((matcher) => matcher.test(text)));
}

export function getDepartmentContextGuide(department: string): string {
  const profile = getDepartmentProfile(department);
  if (!profile) return '진료과 환자군을 먼저 맞추고, 다른 과 전용 환자군은 쓰지 마세요.';
  return `${profile.label} 허용 환자군: ${profile.allowedContext.source}. 금지: ${profile.forbiddenContext.source}.`;
}

export function hasDepartmentMismatch(text: string, department: string): boolean {
  const profile = getDepartmentProfile(department);
  if (!profile) return false;
  if (profile.forbiddenContext.test(text)) return true;
  if (profile.allowedContext.test(text)) return false;
  return GENERAL_FORBIDDEN.test(text);
}

export function isTextAllowedForDepartment(text: string, department: string): boolean {
  return !hasDepartmentMismatch(text, department);
}

export function buildDepartmentFallbackPlan(product: string, department: string): Pick<DetailKey, 'product' | 'patientGroup' | 'detailAxis' | 'doctorReaction' | 'nextAction' | 'narrativeStyle'> {
  const profile = getDepartmentProfile(department);
  const normalizedProduct = normalizeVisitProduct(product);
  const fallback = profile?.fallback[normalizedProduct];
  if (fallback) {
    return {
      product: normalizedProduct,
      patientGroup: fallback.patientGroup,
      detailAxis: fallback.detailAxis,
      doctorReaction: '',
      nextAction: fallback.nextAction,
      narrativeStyle: '환자 케이스 연결형',
    };
  }
  return {
    product: normalizedProduct,
    patientGroup: normalizedProduct === '페린젝트'
      ? '진료과 기준에 맞는 수술 전후 빈혈 환자'
      : '진료과 기준에 맞는 회복기 영양 보충 환자',
    detailAxis: normalizedProduct === '페린젝트'
      ? '페린젝트의 1회 투여와 Hb 회복 근거'
      : `${normalizedProduct}의 단백 보충과 회복기 영양 공급`,
    doctorReaction: '',
    nextAction: normalizedProduct === '페린젝트'
      ? '진료과 기준 빈혈 환자의 Hb 추이 확인'
      : '진료과 기준 회복기 환자의 영양 반응 확인',
    narrativeStyle: '환자 케이스 연결형',
  };
}

export function buildDepartmentSafeVisitOutput(product: string, department: string): { formattedLog: string; nextStrategy: string; products: ProductName[] } {
  const profile = getDepartmentProfile(department);
  const normalizedProduct = normalizeVisitProduct(product);
  const fallback = profile?.fallback[normalizedProduct];
  if (fallback) {
    return {
      formattedLog: fallback.formattedLog,
      nextStrategy: fallback.nextStrategy,
      products: [normalizedProduct],
    };
  }
  const plan = buildDepartmentFallbackPlan(normalizedProduct, department);
  return {
    formattedLog: `${plan.product} ${plan.detailAxis.replace(new RegExp(`^${plan.product}의\\s*`), '')}을 ${plan.patientGroup} 상황에 맞춰 말씀드림. 교수님께서 기준이 맞는 환자부터 보겠다는 반응 보임`,
    nextStrategy: `다음방문시에는 ${plan.nextAction}할예정`,
    products: [normalizedProduct],
  };
}

export function stripDoctorDepartmentPrefix(
  text: string,
  options: { department?: string; doctorName?: string; hospital?: string }
): string {
  let output = text.trim();
  const department = options.department?.trim();
  const doctorName = options.doctorName?.trim();
  const hospital = options.hospital?.trim();
  const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixes = [
    hospital && department && doctorName ? `${escaped(hospital)}\\s*${escaped(department)}\\s*${escaped(doctorName)}\\s*(?:교수님|교수)?` : '',
    department && doctorName ? `${escaped(department)}\\s*${escaped(doctorName)}\\s*(?:교수님|교수)?` : '',
    hospital && department ? `${escaped(hospital)}\\s*${escaped(department)}` : '',
    doctorName ? `${escaped(doctorName)}\\s*(?:교수님|교수)` : '',
  ].filter(Boolean);

  for (const prefix of prefixes) {
    output = output.replace(new RegExp(`^\\s*${prefix}\\s*[,，:-]?\\s*`, 'i'), '');
  }
  return output.trim();
}
