const KNOWN_PRODUCTS = ['위너프에이플러스', '위너프', '페린젝트', '플라주OP'] as const;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.。!?])\s+|[,，]\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripBrokenFutureFragments(text: string): string {
  return text
    .replace(/(?:확인|살펴|검토|진행|안내|여쭤|보여드려|가져가|보)\s*해?\s*보겠을(?=\s*할예정|$)/gi, '')
    .replace(/(?:확인|살펴|검토|진행|안내|여쭤|보여드려|가져가|보)\s*해?\s*보겠음(?=\s*할예정|$)/gi, '')
    .replace(/보겠을(?=\s*할예정|$)/gi, '')
    .trim();
}

function isWinufComparisonSentence(text: string): boolean {
  const normalized = compact(text);
  return /위너프(?!에이플러스)/.test(normalized) && /(기존|비교|차이|대비|TPN)/.test(normalized);
}

function hasForeignProductMention(sentence: string, primaryProduct: string): boolean {
  const normalized = compact(sentence);
  const primary = primaryProduct;

  if (primary === '위너프에이플러스') {
    if (/페린젝트|플라주OP|IViron|iviron|정맥철/.test(normalized)) return true;
    if (/위너프(?!에이플러스)/.test(normalized) && !isWinufComparisonSentence(normalized)) return true;
    return false;
  }

  return KNOWN_PRODUCTS.some((product) => {
    return product !== primary && normalized.includes(compact(product));
  });
}

function isVisitPlanSentence(sentence: string): boolean {
  const normalized = compact(sentence);
  if (!normalized) return false;

  const futureAction = '(?:여쭤볼|확인할|살펴볼|검토할|진행할|안내할|가져갈|보여드릴|볼)';
  const futureTail = '(?:예정|할예정|볼예정|확인예정|여쭤볼예정|살펴볼예정|검토할예정|진행할예정|안내할예정|확인함예정)$';
  const planMarker = '(?:다음(?:방문(?:시)?(?:에는|엔|에|는)?|번에는|번엔|번에|에는|엔|에)|다음엔|다음에)';

  if (new RegExp(planMarker).test(normalized)) {
    if (new RegExp(`${futureAction}.*${futureTail}`).test(normalized)) return true;
    if (/다음.*(?:할예정|볼예정|확인예정|여쭤볼예정|살펴볼예정|검토할예정|진행할예정|안내할예정|확인함예정)/.test(normalized)) {
      return true;
    }
  }

  return new RegExp(`(?:${futureAction}).*${futureTail}`).test(normalized);
}

function truncateAtVisitPlanMarker(sentence: string): string {
  const marker = sentence.match(
    /(?:다음\s*(?:방문\s*시(?:에는|엔|에|는)?|방문(?:시)?(?:에는|엔|에|는)?|번에는|번엔|번에|에는|엔|에)|다음엔|다음에|(?:여쭤볼|확인할|살펴볼|검토할|진행할|안내할|가져갈|보여드릴|볼)\s*(?:예정|할예정|볼예정|확인예정|여쭤볼예정|살펴볼예정|검토할예정|진행할예정|안내할예정|확인함예정))/
  );
  if (!marker || marker.index === undefined) return sentence.trim();
  const prefix = sentence.slice(0, marker.index).trim();
  const normalizedPrefix = prefix.replace(/[,\s]+$/g, '').trim();
  if (!normalizedPrefix) return '';
  if (/^(위너프에이플러스|페린젝트|플라주OP)(?:의)?$/i.test(normalizedPrefix)) return '';
  if (/^(위너프에이플러스|페린젝트|플라주OP)의$/i.test(normalizedPrefix)) return '';
  return normalizedPrefix.length >= 12 ? normalizedPrefix : '';
}

function stripTrailingVisitPlan(text: string): string {
  const compacted = text.replace(/\s+/g, ' ').trim();
  const match = compacted.match(/(?:\s|^)(다음\s*(?:방문\s*시(?:에는|엔|에|는)?|방문(?:시)?(?:에는|엔|에|는)?|번에는|번엔|번에|에는|엔|에)|다음엔|다음에).*/);
  if (!match || match.index === undefined) return compacted;
  const prefix = compacted.slice(0, match.index).trim();
  return prefix;
}

export function sanitizeVisitLogBody(text: string, primaryProduct: string): string {
  const kept = splitSentences(text)
    .map((sentence) => truncateAtVisitPlanMarker(sentence))
    .filter(Boolean)
    .filter((sentence) => !isVisitPlanSentence(sentence))
    .filter((sentence) => !hasForeignProductMention(sentence, primaryProduct));

  return stripTrailingVisitPlan(kept.join(' ').replace(/\s{2,}/g, ' ').trim());
}

export function hasVisitLogProductLeak(text: string, primaryProduct: string): boolean {
  return splitSentences(text).some((sentence) => hasForeignProductMention(sentence, primaryProduct));
}

export function hasVisitPlanLeak(text: string): boolean {
  return splitSentences(text).some((sentence) => isVisitPlanSentence(sentence));
}

function hasClosingReaction(sentence: string): boolean {
  const normalized = compact(sentence);
  return /교수님께서|교수께서|교수님은|교수는|반응보임|의견보임|관심보임|공감|검토|판단|보겠|하심|하셨|써보|질문|문의|응답/.test(normalized);
}

export function trimAfterReactionSentence(text: string): string {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return text.trim();

  const cutIndex = sentences.findIndex((sentence) => hasClosingReaction(sentence));
  if (cutIndex < 0) return text.trim();
  return sentences.slice(0, cutIndex + 1).join(' ').replace(/\s{2,}/g, ' ').trim();
}

export function sanitizeNextStrategyText(text: string, primaryProduct: string): string {
  const fallbackCore = '처방 가능 케이스 확인';
  const escapedProduct = escapeRegExp(primaryProduct);
  const cleaned = text
    .replace(/['"]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();

  const withoutProductPrefix = cleaned
    .replace(new RegExp(`^${escapedProduct}의\\s*`, 'g'), '')
    .replace(new RegExp(`^${escapedProduct}\\s*`, 'g'), '')
    .trim();

  const markerRegex = /(?:다음\s*(?:방문\s*시(?:에는|엔|에|는)?|방문(?:시)?(?:에는|엔|에|는)?|번에는|번엔|번에|에는|엔|에)|다음엔|다음에)/g;
  const markers = [...withoutProductPrefix.matchAll(markerRegex)];
  const marker = markers.length > 0 ? markers[markers.length - 1] : null;
  const afterMarker = marker?.index !== undefined
    ? withoutProductPrefix.slice(marker.index + marker[0].length)
    : withoutProductPrefix;

  const withoutAnyProduct = afterMarker
    .replace(/\b(?:위너프에이플러스|페린젝트|플라주OP)\b\s*/g, '')
    .replace(/\b위너프(?!에이플러스)\b\s*/g, '')
    .trim();

  const core = stripBrokenFutureFragments(afterMarker)
    .replace(new RegExp(`^${escapedProduct}의\\s*`, 'g'), '')
    .replace(new RegExp(`^${escapedProduct}\\s*`, 'g'), '')
    .replace(/^(?:다음\s*(?:방문(?:시)?에는|방문(?:시)?엔|방문(?:시)?에|번에는|번엔|번에|에는|엔|에)|다음엔|다음에)\s*/g, '')
    .replace(/확인드림/gi, '')
    .replace(/(?:해\s*)?보겠음/gi, '')
    .replace(/여쭙겠음/gi, '')
    .replace(/중심으로\s*/gi, '')
    .replace(/드림/gi, '')
    .replace(/드릴/gi, '')
    .replace(/환자군\s*환자/gi, '환자군')
    .replace(/확인할\s+확인할예정/gi, '확인할예정')
    .replace(/확인할\s+확인할\s*예정/gi, '확인할예정')
    .replace(/(?:확인해보(?:겠|겟)음|여쭤보(?:겠|겟)음|살펴보(?:겠|겟)음|검토해보(?:겠|겟)음|진행해보(?:겠|겟)음|안내해보(?:겠|겟)음|가져가(?:겠|겟)음|보여드려보(?:겠|겟)음|볼예정|확인예정|여쭤볼예정|살펴볼예정|검토할예정|진행할예정|안내할예정|확인함예정|할예정|예정)+$/g, '')
    .replace(/(?:확인|여쭤볼|살펴볼|검토할|진행할|안내할|가져갈|보여드릴|볼|적용|처방)\s*$/g, '')
    .replace(/(?:,|·|\.)\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const finalCore = (core || withoutAnyProduct || fallbackCore)
    .replace(/\b(?:위너프에이플러스|페린젝트|플라주OP)\b/g, '')
    .trim() || fallbackCore;
  return `다음방문시에는 ${finalCore} 확인할예정`
    .replace(/(?:다음방문시에는\s*){2,}/g, '다음방문시에는 ')
    .replace(/(?:확인할예정){2,}/g, '확인할예정')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
