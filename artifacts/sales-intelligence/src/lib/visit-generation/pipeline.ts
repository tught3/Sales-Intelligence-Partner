import { buildContext } from './context';
import { generateWithPlan } from './generator';
import { normalize } from './normalizer';
import { buildPlan, preCheckUniqueness } from './planner';
import { finalizeVisitGenerationOutput } from './finalizer';
import { initTrace, type PipelineTraceBuilder } from './trace';
import type { GenerationResult, RawGenerationOutput, ValidationFailType, VisitGenerationDependencies, VisitGenerationInput } from './types';
import { validate } from './validator';

const NON_BLOCKING_FINAL_FAIL_TYPES: ValidationFailType[] = ['LEARNED_FORBIDDEN'];

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
      return makeResult(current, raw, plan, ctx, false, trace);
    }

    // ── few-shot 프롬프트 전환 후: 모든 실패를 non-blocking으로 처리, AI 출력 그대로 반환 ──
    // repair 루프 제거 — 하드코딩 문장으로 교체하는 로직은 품질을 낮추므로 사용 안 함
    trace.add('ai_pass_through', {
      output: current,
      note: `validation failed: ${firstValidation.failTypes.join(', ')} — AI 출력 유지 (repair 루프 제거)`,
    });
    return makeResult(current, raw, plan, ctx, false, trace);

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
  trace: PipelineTraceBuilder
): GenerationResult {
  const finalized = finalizeVisitGenerationOutput({
    formattedLog: current.formattedLog,
    nextStrategy: current.nextStrategy,
    products: raw.products?.length ? raw.products : [plan.product],
    department: ctx.doctor.department || '',
  });
  const finalValidation = validate(finalized.formattedLog, finalized.nextStrategy, plan, ctx);
  trace.add('validate_final', {
    output: finalValidation.pass ? 'PASS' : finalValidation.details,
    failTypes: finalValidation.pass ? [] : finalValidation.failTypes,
  });

  const isNonBlockingFinalFailure = !finalValidation.pass &&
    finalValidation.failTypes.length > 0 &&
    finalValidation.failTypes.every((type) => NON_BLOCKING_FINAL_FAIL_TYPES.includes(type));

  if (!finalValidation.pass && !isNonBlockingFinalFailure) {
    trace.add('hard_fallback', {
      output: finalized,
      failTypes: finalValidation.failTypes,
      note: `failed final validation: ${finalValidation.failTypes.join(', ')}`,
    });
    const fallbackTrace = trace.finish('fallback');
    return {
      formattedLog: finalized.formattedLog,
      nextStrategy: finalized.nextStrategy,
      visitDate: raw.visitDate ?? ctx.todayDate,
      products: finalized.products,
      templateId: plan.templateId,
      usedFallback: true,
      trace: fallbackTrace,
    };
  }

  const finalTrace = trace.finish('success');
  return {
    formattedLog: finalized.formattedLog,
    nextStrategy: finalized.nextStrategy,
    visitDate: raw.visitDate ?? ctx.todayDate,
    products: finalized.products,
    templateId: plan.templateId,
    usedFallback,
    trace: finalTrace,
  };
}
