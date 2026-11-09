import { expect, test } from 'vitest';
import {
  accrueCost,
  checkBudget,
  EvalAbort,
  judgeCost,
  projectCost,
  validatePrices,
  type EvalPrices,
} from '@/lib/eval/budget';
const prices: EvalPrices = {
  chatInput: 1,
  chatOutput: 2,
  judgeInput: 3,
  judgeOutput: 4,
  embed: 0.1,
};

test('TC-121 / UT-26 / FR-44: projection and scaled baseline use the maximum', () => {
  const formula = (40 * (9000 + 900 * 2) + 32 * (5000 * 3 + 300 * 4)) / 1e6;
  expect(projectCost(40, 32, prices)).toBe(formula);
  expect(projectCost(40, 32, prices, { totalUsd: 0.001, count: 40 })).toBe(formula);
  expect(projectCost(20, 16, prices, { totalUsd: 4, count: 40 })).toBe(2);
  expect(projectCost(40, 32, prices, { totalUsd: 0, count: 0 })).toBe(formula);
  expect(() => {
    checkBudget(formula, formula, 'live');
  }).not.toThrow();
  expect(() => {
    checkBudget(formula, formula - 0.01, 'live');
  }).toThrow(expect.objectContaining({ exitCode: 3 }));
});

test('TC-122 / UT-26 / FR-44: accrual and all five zero prices', () => {
  const cost = accrueCost(accrueCost(0, 0.5), 0.6);
  expect(cost).toBe(1.1);
  expect(() => {
    checkBudget(cost, 1, 'live');
  }).toThrow(EvalAbort);
  expect(() => {
    checkBudget(cost, 1, 'mock');
  }).not.toThrow();
  for (const key of Object.keys(prices)) {
    expect(() => {
      validatePrices('live', { ...prices, [key]: 0 });
    }).toThrow(
      expect.objectContaining({
        exitCode: 2,
        message: 'Set PRICE_* variables; the budget guard cannot work with zero prices',
      }),
    );
    expect(() => {
      validatePrices('mock', { ...prices, [key]: 0 });
    }).not.toThrow();
  }
  expect(() => {
    validatePrices('live', prices);
  }).not.toThrow();
  expect(judgeCost({ inputTokens: 100, outputTokens: 20, reasoningTokens: 5 }, prices)).toBe(
    400 / 1e6,
  );
});
