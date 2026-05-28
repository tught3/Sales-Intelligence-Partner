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
    .replace(/추가\s*디테일\s*진행할예정/gi, '처방 상황 확인할예정')
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

  if (formattedLog && !hasProduct(formattedLog, plan.product)) {
    formattedLog = `${plan.product}의 ${formattedLog}`;
  }
  formattedLog = normalizeRepeatedProductPrefix(formattedLog, plan.product);

  if (nextStrategy && !nextStrategy.startsWith('다음방문시에는')) {
    nextStrategy = `다음방문시에는 ${nextStrategy.replace(/^다음\s*방문(?:시)?에는?\s*/, '')}`;
  }

  if (nextStrategy && !nextStrategy.endsWith('할예정')) {
    nextStrategy = `${nextStrategy.replace(/[.。]$/, '')}할예정`;
  }
  nextStrategy = normalizeRepeatedProductPrefix(nextStrategy, plan.product);

  return { formattedLog, nextStrategy };
}
