import { normalizeTerminology } from './detailKeys';
import type { DetailKey } from './types';

export type NormalizedOutput = {
  formattedLog: string;
  nextStrategy: string;
};

function clean(text: string): string {
  return normalizeTerminology(text)
    .replace(/실제\s*적용\s*환자군/gi, '처방을 고려할 만한 케이스')
    .replace(/적용\s*환자군\s*확인/gi, '처방을 고려할 상황 확인')
    .replace(/환자군\s*중심으로/gi, '상황에서')
    .replace(/환자\s*부담\s*감소/gi, '환자 비용 완화')
    .replace(/포도당\s*부담\s*감소/gi, '저포도당 조성')
    .replace(/혈당\s*부담\s*감소/gi, '혈당 관리')
    .replace(/수혈\s*부담\s*감소/gi, '수혈 회피 가능성')
    .replace(/부담\s*감소/gi, '완화')
    .replace(/추가\s*디테일\s*진행할예정/gi, '디테일 예정')
    .replace(/["']/g, '')
    .replace(/[·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNextStrategyEnding(text: string): string {
  return text
    .replace(/(?:확인|점검|체크|문의|안내|전달|진행|검토)\s*할예정$/g, '디테일 예정')
    .replace(/(?:확인|점검|체크|문의|안내|전달|진행|검토)\s*예정$/g, '디테일 예정')
    .replace(/디테일\s*할예정$/g, '디테일 예정')
    .replace(/디테일\s*진행\s*예정$/g, '디테일 예정')
    .replace(/할예정$/g, '디테일 예정')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalize(
  raw: { formattedLog: string; nextStrategy: string },
  plan: DetailKey
): NormalizedOutput {
  let formattedLog = clean(raw.formattedLog);
  let nextStrategy = clean(raw.nextStrategy);

  if (formattedLog && !formattedLog.includes(plan.product)) {
    formattedLog = `${plan.product}의 ${formattedLog}`;
  }

  if (nextStrategy && !nextStrategy.startsWith('다음방문시에는')) {
    nextStrategy = `다음방문시에는 ${nextStrategy.replace(/^다음\s*방문(?:시)?에는?\s*/, '')}`;
  }

  if (nextStrategy && !/디테일\s*예정$/.test(nextStrategy)) {
    nextStrategy = `${nextStrategy.replace(/[.。]$/, '')} 디테일 예정`;
  }
  nextStrategy = normalizeNextStrategyEnding(nextStrategy);

  return { formattedLog, nextStrategy };
}
