import { describe, expect, it } from 'vitest';
import { getSTTBillableUsage } from '@fastgpt/service/core/ai/audio/utils';

describe('getSTTBillableUsage', () => {
  it.each([undefined, {}, { unitPrice: 0.2 }, { type: 'duration' as const }])(
    'uses only upstream seconds for duration pricing %j',
    (pricing) => {
      expect(
        getSTTBillableUsage({ pricing, usage: { type: 'tokens', seconds: 3, total_tokens: 77 } })
      ).toEqual({ type: 'duration', seconds: 3 });
    }
  );
  it.each([undefined, null, -1, NaN, Infinity, -Infinity, '77'])(
    'treats invalid seconds %s as zero',
    (seconds) => {
      expect(getSTTBillableUsage({ usage: { seconds, total_tokens: 77 } })).toEqual({
        type: 'duration',
        seconds: 0
      });
    }
  );
  it.each([0, 0.2, 2.5, 60])('does not round or enforce a minimum on %s seconds', (seconds) => {
    expect(getSTTBillableUsage({ usage: { seconds } })).toEqual({ type: 'duration', seconds });
  });
  it('records zero when upstream usage is absent', () => {
    expect(getSTTBillableUsage({})).toEqual({ type: 'duration', seconds: 0 });
    expect(getSTTBillableUsage({ pricing: { type: 'tokens' } })).toEqual({
      type: 'tokens',
      totalTokens: 0
    });
  });
  it.each([undefined, null, -1, 1.5, NaN, Infinity, '77', Number.MAX_SAFE_INTEGER + 1])(
    'treats invalid tokens %s as zero',
    (total_tokens) => {
      expect(
        getSTTBillableUsage({ pricing: { type: 'tokens' }, usage: { seconds: 3, total_tokens } })
      ).toEqual({ type: 'tokens', totalTokens: 0 });
    }
  );
  it.each([0, 77, 1733])('uses only reported total_tokens=%s for token pricing', (total_tokens) => {
    expect(
      getSTTBillableUsage({
        pricing: { type: 'tokens' },
        usage: { type: 'tokens', seconds: 60, total_tokens }
      })
    ).toEqual({ type: 'tokens', totalTokens: total_tokens });
  });
  it('accepts genuine untyped token usage but excludes duration compatibility counters', () => {
    expect(
      getSTTBillableUsage({ pricing: { type: 'tokens' }, usage: { total_tokens: 77 } })
    ).toEqual({ type: 'tokens', totalTokens: 77 });
    expect(
      getSTTBillableUsage({
        pricing: { type: 'tokens' },
        usage: { type: 'duration', seconds: 3, total_tokens: 3 }
      })
    ).toEqual({ type: 'tokens', totalTokens: 0 });
  });
});
