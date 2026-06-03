import { buildContext } from './context';
import { generateWithPlan } from './generator';
import { normalize } from './normalizer';
import { buildPlan, preCheckUniqueness } from './planner';
import { buildFallback, repair, MAX_REPAIR_ATTEMPTS } from './repair';
import { initTrace } from './trace';
import type { GenerationResult, PipelineTrace, RawGenerationOutput, VisitGenerationDependencies, VisitGenerationInput } from './types';
import { resolveRepairTarget, validate } from './validator';
import type { ValidationFailType } from './types';

// AI 출력에서 이 항목만 실패하면 → 템플릿으로 교체하지 않고 AI 출력 그대로 반환
// 템플릿 repair는 이런 문제를 해결할 수 없고 오히려 품질을 낮춤
const NON_BLOCKING_FAIL_TYPES = new Set<ValidationFailType>([
  'DUPLICATE_BATCH',
  'DUPLICATE_PAST',
  'DUPLICATE_REACTION',
  'DUPLICATE_STRATEGY',
  'LEARNED_FORBIDDEN',
  'MISSING_REACTION',
  'LENGTH_SHORT',
]);

function isOnlyNonBlocking(failTypes: ValidationFailType[]): boolean {
  return failTypes.length > 0 && failTypes.every((t) => NON_BLOCKING_FAIL_TYPES.has(t));
}

export async function runVisitGenerationPipeline(
  input: VisitGenerationInput,
  deps: VisitGenerationDependencies
): Promise<GenerationResult> {
  const trace = initTrace(input.doctor.id);
  const ctx = buildContext(
    input.doctor,
    input.pastLogs,
    input.selectedProducts,
    input.batchAvoidTexts,
    input.batchUsedTemplateIds ?? [],
    input.batchUsedProducts ?? [],
    input.manualRawNotes
  );
  trace.add('context', {
    output: {
      mode: input.mode,
      doctorId: ctx.doctor.id,
      availableProducts: ctx.availableProducts,
      batchUsedDetailKeys: ctx.batchUsedDetailKeys,
    },
  });

  let plan = buildPlan(ctx);
  plan = preCheckUniqueness(plan, ctx);
  trace.add('plan', { output: plan, note: plan.selectionReason });

  try {
    const raw = await generateWithPlan(input, plan, ctx, deps);
    trace.add('generate', { output: { products: raw.products, visitDate: raw.visitDate } });

    const current = normalize(
      { formattedLog: raw.formattedLog, nextStrategy: raw.nextStrategy },
      plan
    );
    trace.add('normalize', { output: current });

    // ── 1차: AI 출력 검증 ──────────────────────────────────────
    const firstValidation = validate(current.formattedLog, current.nextStrategy, plan, ctx);
    trace.add('validate_0', {
      output: firstValidation.pass ? 'PASS' : firstValidation.details,
      failTypes: firstValidation.pass ? [] : firstValidation.failTypes,
    });

    if (firstValidation.pass) {
      const final = trace.finish('success');
      return makeResult(current, raw, plan, ctx, false, final);
    }

    // ── 핵심: non-blocking 실패만 있으면 AI 출력을 그대로 반환 ──
    // 템플릿 repair는 LENGTH_SHORT·MISSING_REACTION을 개선하지 못하고
    // 오히려 품질 낮은 기계적 텍스트로 교체됨
    if (isOnlyNonBlocking(firstValidation.failTypes)) {
      trace.add('ai_nonblocking_pass', {
        output: current,
        note: `non-blocking only: ${firstValidation.failTypes.join(', ')} — AI 출력 유지`,
      });
      const final = trace.finish('success');
      return makeResult(current, raw, plan, ctx, false, final);
    }

    // ── 2차: 구조적 실패(MISSING_PRODUCT·DEPT_MISMATCH 등)만 repair ──
    let repaired = current;
    let usedFallback = false;

    for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
      const validation = validate(repaired.formattedLog, repaired.nextStrategy, plan, ctx);
      trace.add(`validate_repair_${attempt}`, {
        output: validation.pass ? 'PASS' : validation.details,
        failTypes: validation.pass ? [] : validation.failTypes,
      });

      if (validation.pass) {
        const final = trace.finish(usedFallback ? 'fallback' : 'success');
        return makeResult(repaired, raw, plan, ctx, usedFallback, final);
      }

      // repair 후에도 non-blocking만 남으면 현재 결과 반환
      if (isOnlyNonBlocking(validation.failTypes)) {
        const final = trace.finish(usedFallback ? 'fallback' : 'success');
        return makeResult(repaired, raw, plan, ctx, usedFallback, final);
      }

      const target = resolveRepairTarget(validation.failTypes);
      const repairedRaw = await repair(repaired, validation, plan, ctx, target, attempt);
      usedFallback = usedFallback || repairedRaw.usedFallback;
      repaired = normalize(repairedRaw, plan);
      trace.add(`repair_${attempt}`, { output: repaired, failTypes: validation.failTypes });
    }

    // ── 최종: 마지막 repair 결과 반환 (non-blocking이면 통과) ──
    const finalValidation = validate(repaired.formattedLog, repaired.nextStrategy, plan, ctx);
    trace.add('validate_final', {
      output: finalValidation.pass ? 'PASS' : finalValidation.details,
      failTypes: finalValidation.pass ? [] : finalValidation.failTypes,
    });

    if (finalValidation.pass || isOnlyNonBlocking(finalValidation.failTypes)) {
      const final = trace.finish('fallback');
      return makeResult(repaired, raw, plan, ctx, true, final);
    }

    // ── 진짜 최후: 하드 fallback (구조적 blocking 실패가 모두 수리 안 된 경우) ──
    const hardFallback = normalize(buildFallback(plan, ctx), plan);
    usedFallback = true;
    trace.add('hard_fallback', { output: hardFallback });
    const final = trace.finish('fallback');
    return makeResult(hardFallback, raw, plan, ctx, true, final);

  } catch (error) {
    trace.add('error', { note: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

function makeResult(
  current: { formattedLog: string; nextStrategy: string },
  raw: RawGenerationOutput,
  plan: ReturnType<typeof buildPlan>,
  ctx: ReturnType<typeof buildContext>,
  usedFallback: boolean,
  trace: PipelineTrace
): GenerationResult {
  return {
    formattedLog: current.formattedLog,
    nextStrategy: current.nextStrategy,
    visitDate: raw.visitDate ?? ctx.todayDate,
    products: raw.products?.length ? raw.products : [plan.product],
    templateId: plan.templateId,
    usedFallback,
    trace,
  };
}
