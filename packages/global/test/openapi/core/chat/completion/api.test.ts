import { describe, expect, it } from 'vitest';
import { CompletionsPropsSchema } from '../../../../../openapi/core/chat/completion/api';

describe('CompletionsPropsSchema authProxy', () => {
  it('keeps existing requests working when authProxy is omitted', () => {
    const result = CompletionsPropsSchema.parse({});

    expect(result.authProxy).toBeUndefined();
  });

  it('normalizes null authProxy to undefined', () => {
    const result = CompletionsPropsSchema.parse({
      authProxy: null
    });

    expect(result.authProxy).toBeUndefined();
  });

  it('accepts username and tmbId for API key proxy calls', () => {
    const tmbId = '68ee0bd23d17260b7829b137';
    const result = CompletionsPropsSchema.parse({
      authProxy: {
        username: ' user@example.com ',
        tmbId
      }
    });

    expect(result.authProxy).toEqual({
      username: 'user@example.com',
      tmbId
    });
  });

  it('rejects empty authProxy objects', () => {
    const result = CompletionsPropsSchema.safeParse({
      authProxy: {}
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown authProxy fields', () => {
    const result = CompletionsPropsSchema.safeParse({
      authProxy: {
        username: 'user@example.com',
        role: 'admin'
      }
    });

    expect(result.success).toBe(false);
  });
});
