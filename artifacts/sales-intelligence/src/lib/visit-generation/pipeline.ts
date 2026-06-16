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
    const firstValidation = validate(current.formattedLog, current.nextStrategy, plan, ctx);
    trace.add('validate_0', {
      output: firstValidation.pass ? 'PASS' : firstValidation.details,
      failTypes: firstValidation.pass ? [] : firstValidation.failTypes,
    });

    if (firstValidation.pass) {
      const final = trace.finish('success');
      return makeResult(current, raw, plan, ctx, false, final);
    }

    let repaired = current;
    let usedFallback = false;
    for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
      const validation = validate(repaired.formattedLog, repaired.nextStrategy, plan, ctx);
      if (validation.pass) {
        const final = trace.finish('success');
        return makeResult(repaired, raw, plan, ctx, usedFallback, final);
      }
      const target = resolveRepairTarget(validation.failTypes);
      const repairedRaw = await repair(repaired, validation, plan, ctx, target, attempt);
      usedFallback = usedFallback || repairedRaw.usedFallback;
      repaired = normalize(
        { formattedLog: repairedRaw.formattedLog, nextStrategy: repairedRaw.nextStrategy },
        plan
      );
      trace.add(`repair_${attempt}`, {
        output: repaired,
        note: `validate_repair target=${target.field}; failTypes=${target.reasons.join(', ')}`,
        failTypes: target.reasons,
      });
    }

    const finalValidation = validate(repaired.formattedLog, repaired.nextStrategy, plan, ctx);
    trace.add('validate_final', {
      output: finalValidation.pass ? 'PASS' : finalValidation.details,
      failTypes: finalValidation.pass ? [] : finalValidation.failTypes,
    });
    if (finalValidation.pass || (!finalValidation.pass && finalValidation.failTypes.every((type) => type === 'LEARNED_FORBIDDEN'))) {
      const final = trace.finish('success');
      return makeResult(repaired, raw, plan, ctx, usedFallback, final);
    }

    const hardFallback = normalize(buildFallback(plan, ctx), plan);
    trace.add('hard_fallback', {
      output: hardFallback,
      note: `failed final validation: ${finalValidation.pass ? '' : finalValidation.failTypes.join(', ')}`,
      failTypes: finalValidation.pass ? [] : finalValidation.failTypes,
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
