import { expect, test, vi } from 'vitest';
import tool from '..';

test('mathExprVal', async () => {
  const result = await tool.cb({
    数学表达式: '100*100'
  });
  expect(result.output.result).toBe(10000);
});
