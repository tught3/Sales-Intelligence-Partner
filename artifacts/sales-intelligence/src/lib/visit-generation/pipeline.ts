import { buildContext } from './context';
import { generateWithPlan } from './generator';
import { normalize } from './normalizer';
import { buildPlan, preCheckUniqueness } from './planner';
import { repair, MAX_REPAIR_ATTEMPTS } from './repair';
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
