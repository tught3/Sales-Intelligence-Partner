import { normalizeTerminology } from './detailKeys';
import type { DetailKey } from './types';

export type NormalizedOutput = {
  formattedLog: string;
  nextStrategy: string;
};

function clean(text: string): string {
  return normalizeTerminology(text)
    // 취소선 마크다운(~~) 제거
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/~~/g, '')
    // "예정할예정" 중복 버그 수정
    .replace(/할예정할예정/g, '할예정')
    .replace(/예정할예정/g, '할예정')
    .replace(/예정\s+할예정/g, '할예정')
    // 조사 오류 자동 수정 ("결과을" → "결과를" 등 받침 없는 글자 뒤 "을" → "를")
    .replace(/([가-힣])을(\s|$)/g, (m, p1, p2) => {
      const code = p1.charCodeAt(0);
      const jongseong = (code - 0xAC00) % 28;
      return jongseong === 0 ? p1 + '를' + p2 : m;
    })
    // "추가로" 문서체 제거 (패턴 확장)
    .replace(/[.\s]*추가로\s+/g, ' ')
    // "흐름" 관련 — 구체적 패턴 먼저 처리 후 정리함 제거
    .replace(/흐름으로\s*정리함/g, '말씀드렸더니')
    .replace(/흐름과\s*반응을\s*함께\s*보겠다고[^.]*/g, '')
    // "정리함" 단어만 제거 (앞 문장까지 삭제하던 공격적 패턴 제거)
    .replace(/\s*정리함/g, '')
    .replace(/환자\s*흐름으로/g, '환자에서')
    // "환자 환자" 중복 제거
    .replace(/환자\s+환자/g, '환자')
    // "포인트" 금지어 — pipeline normalizer에서도 제거
    .replace(/디테일\s*포인트/g, '디테일')
    .replace(/처방\s*포인트/g, '처방 내용')
    .replace(/핵심\s*포인트/g, '핵심')
    .replace(/\s*포인트/g, '')
    // 교수 성향 직접 서술 패턴 제거 ("~과답게 ~하시는 편이라", "~편이라")
    .replace(/[가-힣]+(?:과|부|실|원|과)답게\s*[가-힣\s]+(?:이시는|하시는|하는)\s*편이라\s*/g, '')
    .replace(/[가-힣\s]+(?:이시는|하시는|하는)\s*편이라\s*/g, '')
    // "짧게" 제거 — nextStrategy에서 어색한 표현
    .replace(/짧게\s*/g, '')
    // "MR이" 주어 제거 — 업무 메모는 주어 없이 서술어로만
    .replace(/\bMR이\s+/g, '')
    // "짚어" 금지 → "확인" 으로
    .replace(/짚어드릴/g, '확인드릴')
    .replace(/짚어볼/g, '확인할')
    .replace(/짚어/g, '확인')
    // "말씀드렸더니." 끊긴 문장 정리
    .replace(/말씀드렸더니\.\s*/g, '말씀드렸더니 ')
    .replace(/\s+\./g, '.')
    // "보시면 된다고 안내함" → 자연스러운 MR 주체 표현으로
    .replace(/보시면\s*된다고\s*안내함/g, '말씀드렸더니 확인해보겠다는 반응')
    .replace(/보시면\s*된다고\s*말씀드림/g, '말씀드렸더니 확인해보겠다는 반응')
    .replace(/보시면\s*된다고/g, '된다고 말씀드렸더니')
    // 기존 정규화
    .replace(/근거을/g, '근거를')
    .replace(/반응하셨고/g, '반응 보였고')
    .replace(/반응하셨음/g, '반응 보임')
    .replace(/의견하셨고/g, '의견 보였고')
    .replace(/교수님께서\s+([^。.!?]{2,120}?)(?:라는\s*)?반응\s*보임\s*보임/g, '교수님께서 $1라는 반응 보임')
    .replace(/교수님께서\s+([^。.!?]{2,120}?)(?:라는\s*)?의견\s*보임\s*보임/g, '교수님께서 $1라는 의견 보임')
    .replace(/["']/g, '')
    .replace(/[·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasProduct(text: string, product: string): boolean {
  const compactText = text.replace(/\s+/g, '');
  const compactProduct = product.replace(/\s+/g, '');
  return compactText.includes(compactProduct);
}

function normalizeRepeatedProductPrefix(text: string, product: string): string {
  const productPattern = escapeRegExp(product).replace(/\\\s\+/g, '\\s*');
  const repeatedPrefix = new RegExp(`^(${productPattern})(?:\\s*의)?\\s+\\1(?:\\s*의)?\\s*`, 'i');
  const repeatedAny = new RegExp(`(${productPattern})(?:\\s*의)?\\s+\\1(?:\\s*의)?`, 'gi');
  return text
    .replace(repeatedPrefix, `${product}의 `)
    .replace(repeatedAny, `${product}의`)
    .replace(new RegExp(`^${productPattern}\\s*의\\s*의\\s*`, 'i'), `${product}의 `)
    .replace(new RegExp(`(${productPattern})\\s*의\\s*의`, 'gi'), `${product}의`)
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalize(
  raw: { formattedLog: string; nextStrategy: string },
  plan: DetailKey
): NormalizedOutput {
  let formattedLog = clean(raw.formattedLog);
  let nextStrategy = clean(raw.nextStrategy);

  formattedLog = normalizeRepeatedProductPrefix(formattedLog, plan.product);
  nextStrategy = normalizeRepeatedProductPrefix(nextStrategy, plan.product);

  // 제품 교차 맥락 오염 제거 — 다른 제품의 핵심 키워드가 포함된 문장 제거
  if (plan.product === '위너프에이플러스') {
    // 페린젝트/경구 철분 전용 맥락이 위너프에이플러스 텍스트에 있으면 해당 문장 제거
    formattedLog = formattedLog
      .split(/(?<=[.。])\s+/)
      .filter((s) => !/GI\s*트러블|경구용철분제|철결핍|Hb\s*\d|빈혈(?!\s*회복)/.test(s))
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  if (plan.product === '페린젝트') {
    // 위너프에이플러스 전용 맥락이 페린젝트 텍스트에 있으면 해당 문장 제거
    formattedLog = formattedLog
      .split(/(?<=[.。])\s+/)
      .filter((s) => !/아미노산\s*\d+%|포도당\s*부담\s*감소|TPN|단백\s*보충/.test(s))
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  if (formattedLog && !hasProduct(formattedLog, plan.product)) {
    formattedLog = `${plan.product}의 ${formattedLog}`;
  }
  formattedLog = normalizeRepeatedProductPrefix(formattedLog, plan.product);

  if (nextStrategy && !nextStrategy.startsWith('다음방문시에는')) {
    nextStrategy = `다음방문시에는 ${nextStrategy.replace(/^다음\s*방문(?:시)?에는?\s*/, '')}`;
  }

  if (nextStrategy && !nextStrategy.endsWith('할예정')) {
    // 이중 어미 방지: 드림/드릴로 끝나면 "예정"만 붙임
    nextStrategy = nextStrategy.replace(/[.。]$/, '');
    if (/드림$/.test(nextStrategy)) {
      nextStrategy = nextStrategy.replace(/드림$/, '드릴예정');
    } else if (/드릴$/.test(nextStrategy)) {
      nextStrategy = `${nextStrategy}예정`;
    } else if (!nextStrategy.endsWith('예정')) {
      nextStrategy = `${nextStrategy}할예정`;
    }
  }
  nextStrategy = normalizeRepeatedProductPrefix(nextStrategy, plan.product);

  return { formattedLog, nextStrategy };
}
