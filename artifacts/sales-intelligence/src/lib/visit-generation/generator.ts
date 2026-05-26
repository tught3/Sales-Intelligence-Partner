import type { VisitContext } from './context';
import type { DetailKey, RawGenerationOutput, VisitGenerationDependencies, VisitGenerationInput } from './types';

export async function generateWithPlan(
  input: VisitGenerationInput,
  plan: DetailKey,
  ctx: VisitContext,
  deps: VisitGenerationDependencies
): Promise<RawGenerationOutput> {
  return deps.generateBase(
    {
      ...input,
      selectedProducts: plan.product ? [plan.product] : input.selectedProducts,
      batchAvoidTexts: ctx.batchAvoidTexts,
    },
    plan
  );
}
