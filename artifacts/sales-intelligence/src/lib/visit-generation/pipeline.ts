import { buildContext } from './context';
import { generateWithPlan } from './generator';
import { normalize } from './normalizer';
import { buildPlan, preCheckUniqueness } from './planner';
import { finalizeVisitGenerationOutput } from './finalizer';
import { buildFallback, MAX_REPAIR_ATTEMPTS, repair } from './repair';
import { initTrace } from './trace';
import type { GenerationResult, PipelineTrace, RawGenerationOutput, VisitGenerationDependencies, VisitGenerationInput } from './types';
import { resolveRepairTarget, validate } from './validator';

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
    console.debug('[Pipeline] before validate:', {
      doctorId: ctx.doctor.id,
      department: ctx.doctor.department,
      product: plan.product,
      logLen: current.formattedLog.length,
      logPreview: current.formattedLog.slice(0, 80),
    });
    const firstValidation = validate(current.formattedLog, current.nextStrategy, plan, ctx);
    console.debug('[Pipeline] validate result:', {
      pass: firstValidation.pass,
      failTypes: firstValidation.failTypes,
      logPreview: current.formattedLog.slice(0, 80),
    });
    trace.add('validate_0', {
      output: firstValidation.pass ? 'PASS' : firstValidation.details,
      failTypes: firstValidation.pass ? [] : firstValidation.failTypes,
    });

    if (firstValidation.pass) {
      const final = trace.finish('success');
      return makeResult(current, raw, plan, ctx, false, final);
    }

    // 제품명 누락·타과 제품 혼입이 아닌 경우 AI 출력을 그대로 사용
    // (repair는 AI 재호출 없이 하드코딩 fallback만 반환하므로, 품질 경고성 실패는 통과시킴)
    const isCriticalFailure = firstValidation.failTypes.some(
      (type) => type === 'MISSING_PRODUCT' || type === 'FOREIGN_PRODUCT_MENTION'
    );
    const hasContent = current.formattedLog.length >= 20;

    if (!isCriticalFailure && hasContent) {
      trace.add('validate_0_soft_pass', {
        output: `soft-pass: ${firstValidation.failTypes.join(', ')}`,
        failTypes: firstValidation.failTypes,
      });
      const final = trace.finish('success');
      return makeResult(current, raw, plan, ctx, false, final);
    }

    const hardFallback = normalize(buildFallback(plan, ctx), plan);
    trace.add('hard_fallback', {
      output: hardFallback,
      note: `critical failure: ${firstValidation.failTypes.join(', ')}`,
      failTypes: firstValidation.failTypes,
    });
    const final = trace.finish('fallback');
    return makeResult(hardFallback, raw, plan, ctx, true, final);

  } catch (error) {
    trace.add('error', { note: error instanceof Error ? error.message : String(error) });
    const fallback = normalize(buildFallback(plan, ctx), plan);
    trace.add('hard_fallback', {
      output: fallback,
      note: `generation error fallback: ${error instanceof Error ? error.message : String(error)}`,
      failTypes: [],
    });
    const final = trace.finish('fallback');
    return makeResult(
      fallback,
      {
        formattedLog: fallback.formattedLog,
        nextStrategy: fallback.nextStrategy,
        visitDate: ctx.todayDate,
        products: [plan.product],
      },
      plan,
      ctx,
      true,
      final
    );
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
  const finalized = finalizeVisitGenerationOutput({
    formattedLog: current.formattedLog,
    nextStrategy: current.nextStrategy,
    products: raw.products?.length ? raw.products : [plan.product],
    department: ctx.doctor.department || '',
    doctorName: ctx.doctor.name,
    hospital: ctx.doctor.hospital,
  });
  return {
    formattedLog: finalized.formattedLog,
    nextStrategy: finalized.nextStrategy,
    visitDate: raw.visitDate ?? ctx.todayDate,
    products: finalized.products,
    templateId: plan.templateId,
    usedFallback,
    trace,
  };
}
