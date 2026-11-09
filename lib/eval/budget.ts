import type { TokenUsage } from '@/lib/cost/estimate';

export type EvalPrices = {
  chatInput: number;
  chatOutput: number;
  judgeInput: number;
  judgeOutput: number;
  embed: number;
};

export class EvalAbort extends Error {
  constructor(
    readonly exitCode: 2 | 3,
    message: string,
  ) {
    super(message);
  }
}

export function validatePrices(mode: 'live' | 'mock', prices: EvalPrices): void {
  if (mode === 'live' && Object.values(prices).some((price) => price === 0))
    throw new EvalAbort(2, 'Set PRICE_* variables; the budget guard cannot work with zero prices');
}

export function projectCost(
  total: number,
  answerable: number,
  prices: EvalPrices,
  baseline: { totalUsd: number; count: number } | null = null,
): number {
  const formula =
    (total * (9_000 * prices.chatInput + 900 * prices.chatOutput) +
      answerable * (5_000 * prices.judgeInput + 300 * prices.judgeOutput)) /
    1_000_000;
  return Math.max(
    formula,
    baseline && baseline.count > 0 ? (baseline.totalUsd * total) / baseline.count : 0,
  );
}

export function checkBudget(cost: number, limit: number, mode: 'live' | 'mock'): void {
  if (mode === 'live' && cost > limit)
    throw new EvalAbort(3, 'Eval budget exceeded; no results written.');
}

/** Immutable accrual; the caller checks after each answer and judge call. */
export function accrueCost(accrued: number, callCost: number): number {
  return accrued + callCost;
}

export function judgeCost(usage: TokenUsage, prices: EvalPrices): number {
  return (
    (usage.inputTokens * prices.judgeInput +
      (usage.outputTokens + (usage.reasoningTokens ?? 0)) * prices.judgeOutput) /
    1_000_000
  );
}
