import { describe, expect, it } from 'vitest';
import { getSTTDuration } from '@fastgpt/service/core/ai/audio/utils';

describe('getSTTDuration', () => {
  it('bills a one-second Qwen recording by seconds rather than its 43 tokens', () => {
    const usage = { seconds: 1, total_tokens: 43 };
    expect(getSTTDuration({ usage, fallbackDuration: 2 })).toBe(1);
  });

  it('uses three audio seconds rather than the 77 tokens in a short Qwen response', () => {
    const usage = { seconds: 3, total_tokens: 77 };
    expect(getSTTDuration({ usage, fallbackDuration: 4 })).toBe(3);
  });

  it('keeps a one-minute Qwen recording separate from its 1733 tokens', () => {
    const usage = { seconds: 60, total_tokens: 1733 };
    expect(getSTTDuration({ usage, fallbackDuration: 61 })).toBe(60);
  });

  it('never treats a token-only usage response as seconds', () => {
    const usage: { seconds?: number; total_tokens: number } = { total_tokens: 77 };
    expect(getSTTDuration({ usage, fallbackDuration: 3 })).toBe(3);
  });

  it.each([undefined, null, 0, -1, NaN, Infinity, '43'])(
    'uses the recording duration when upstream seconds is %s',
    (seconds) => {
      expect(getSTTDuration({ usage: { seconds }, fallbackDuration: 3 })).toBe(3);
    }
  );

  it('uses the recording duration when the provider reports no usage', () => {
    expect(getSTTDuration({ fallbackDuration: 3 })).toBe(3);
  });

  it.each([
    [0.2, 1],
    [2.5, 2.5]
  ])('normalizes upstream %s seconds to %s', (seconds, expected) => {
    expect(getSTTDuration({ usage: { seconds }, fallbackDuration: 3 })).toBe(expected);
  });
});
