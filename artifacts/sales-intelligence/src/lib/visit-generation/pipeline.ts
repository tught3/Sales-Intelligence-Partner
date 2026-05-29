import { buildContext } from './context';
import { generateWithPlan } from './generator';
import { normalize } from './normalizer';
import { buildPlan, preCheckUniqueness } from './planner';
import { buildFallback, buildValidationSafeFallback, repair, MAX_REPAIR_ATTEMPTS } from './repair';
import { initTrace } from './trace';
import type { GenerationResult, VisitGenerationDependencies, VisitGenerationInput } from './types';
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

  let usedFallback = false;
  try {
    const raw = await generateWithPlan(input, plan, ctx, deps);
    trace.add('generate', { output: { products: raw.products, visitDate: raw.visitDate } });

    let current = normalize(
      { formattedLog: raw.formattedLog, nextStrategy: raw.nextStrategy },
      plan
    );
    trace.add('normalize', { output: current });

    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      const validation = validate(current.formattedLog, current.nextStrategy, plan, ctx);
      trace.add(`validate_${attempt}`, {
        output: validation.pass ? 'PASS' : validation.details,
        failTypes: validation.pass ? [] : validation.failTypes,
      });

      if (validation.pass) {
        const final = trace.finish(usedFallback ? 'fallback' : 'success');
        return {
          formattedLog: current.formattedLog,
          nextStrategy: current.nextStrategy,
          visitDate: raw.visitDate ?? ctx.todayDate,
          products: raw.products?.length ? raw.products : [plan.product],
          usedFallback,
          trace: final,
        };
      }

      const target = resolveRepairTarget(validation.failTypes);
      const repaired = await repair(current, validation, plan, ctx, target, attempt);
      usedFallback = usedFallback || repaired.usedFallback;
      current = normalize(repaired, plan);
      trace.add(`repair_${attempt}`, { output: current, failTypes: validation.failTypes });
    }

    let finalValidation = validate(current.formattedLog, current.nextStrategy, plan, ctx);
    trace.add('validate_final', {
      output: finalValidation.pass ? 'PASS' : finalValidation.details,
      failTypes: finalValidation.pass ? [] : finalValidation.failTypes,
    });
    if (!finalValidation.pass) {
      current = normalize(buildFallback(plan, ctx), plan);
      usedFallback = true;
      finalValidation = validate(current.formattedLog, current.nextStrategy, plan, ctx);
      trace.add('hard_fallback', {
        output: finalValidation.pass ? current : finalValidation.details,
        failTypes: finalValidation.pass ? [] : finalValidation.failTypes,
      });
    }
    if (!finalValidation.pass) {
      current = normalize(buildValidationSafeFallback(plan, ctx), plan);
      usedFallback = true;
      finalValidation = validate(current.formattedLog, current.nextStrategy, plan, ctx);
      trace.add('validation_safe_fallback', {
        output: finalValidation.pass ? current : finalValidation.details,
        failTypes: finalValidation.pass ? [] : finalValidation.failTypes,
      });
    }
    if (!finalValidation.pass) {
      const remaining = finalValidation.failTypes;
      const nonBlockingFailures = [
        'DUPLICATE_BATCH',
        'DUPLICATE_PAST',
        'DUPLICATE_REACTION',
        'DUPLICATE_STRATEGY',
        'LEARNED_FORBIDDEN',
      ];
      if (remaining.every((type) => nonBlockingFailures.includes(type))) {
        const final = trace.finish('fallback');
        return {
          formattedLog: current.formattedLog,
          nextStrategy: current.nextStrategy,
          visitDate: raw.visitDate ?? ctx.todayDate,
          products: raw.products?.length ? raw.products : [plan.product],
          usedFallback: true,
          trace: final,
        };
      }
      throw new Error(
        `Visit generation failed final validation for ${ctx.doctor.name ?? ctx.doctor.id}: ${finalValidation.details}`
      );
    }

    const final = trace.finish('fallback');
    return {
      formattedLog: current.formattedLog,
      nextStrategy: current.nextStrategy,
      visitDate: raw.visitDate ?? ctx.todayDate,
      products: raw.products?.length ? raw.products : [plan.product],
      usedFallback: true,
      trace: final,
    };
  } catch (error) {
    trace.add('error', { note: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
