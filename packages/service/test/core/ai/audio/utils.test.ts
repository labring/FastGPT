import { describe, expect, it } from 'vitest';
import { getSTTBillableUsage } from '@fastgpt/service/core/ai/audio/utils';

describe('getSTTBillableUsage', () => {
  it.each([
    undefined,
    { type: 'duration' as const },
    { type: 'duration' as const, unitPrice: 0.2 }
  ])('uses only seconds for duration pricing %j', (pricing) => {
    expect(
      getSTTBillableUsage({
        pricing,
        usage: {
          type: 'tokens',
          seconds: 3,
          input_tokens: 125,
          output_tokens: 17,
          total_tokens: 142
        }
      })
    ).toEqual({ type: 'duration', seconds: 3 });
  });
  it.each([undefined, null, -1, NaN, Infinity, -Infinity, '77'])(
    'rejects invalid seconds %s',
    (seconds) => {
      expect(getSTTBillableUsage({ usage: { seconds, total_tokens: 77 } })).toEqual({
        type: 'duration',
        seconds: 0
      });
    }
  );
  it.each([0, 0.2, 2.5, 60])('preserves %s seconds without rounding', (seconds) => {
    expect(getSTTBillableUsage({ usage: { seconds } })).toEqual({ type: 'duration', seconds });
  });
  it('accepts genuine counters independently and ignores total/seconds', () => {
    expect(
      getSTTBillableUsage({
        pricing: { type: 'tokens' },
        usage: { input_tokens: 125, output_tokens: 17, seconds: 77, total_tokens: 999 }
      })
    ).toEqual({ type: 'tokens', inputTokens: 125, outputTokens: 17 });
    for (const usage of [
      undefined,
      { seconds: 77 },
      { total_tokens: 77 },
      { type: 'duration', input_tokens: 5, output_tokens: 2, total_tokens: 7 }
    ]) {
      expect(getSTTBillableUsage({ pricing: { type: 'tokens' }, usage })).toEqual({
        type: 'tokens',
        inputTokens: 0,
        outputTokens: 0
      });
    }
  });
  it.each([undefined, null, -1, 1.5, NaN, Infinity, '77', Number.MAX_SAFE_INTEGER + 1])(
    'zeroes only the invalid side %s',
    (value) => {
      expect(
        getSTTBillableUsage({
          pricing: { type: 'tokens' },
          usage: { input_tokens: value, output_tokens: 17, total_tokens: 142 }
        })
      ).toEqual({ type: 'tokens', inputTokens: 0, outputTokens: 17 });
      expect(
        getSTTBillableUsage({
          pricing: { type: 'tokens' },
          usage: { input_tokens: 125, output_tokens: value, total_tokens: 142 }
        })
      ).toEqual({ type: 'tokens', inputTokens: 125, outputTokens: 0 });
    }
  );
  it('preserves explicit zero counters', () => {
    expect(
      getSTTBillableUsage({
        pricing: { type: 'tokens' },
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 77 }
      })
    ).toEqual({ type: 'tokens', inputTokens: 0, outputTokens: 0 });
  });
});
