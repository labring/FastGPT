import { describe, expect, it } from 'vitest';
import { WecomAppSchema, WecomWebSocketAppSchema } from '@fastgpt/global/support/outLink/type';

const config = { botId: 'bot-1', secret: 'bot-secret', revision: 1 };

describe('WecomWebSocketAppSchema', () => {
  it('normalizes credentials and defaults to offline without status metadata', () => {
    expect(
      WecomWebSocketAppSchema.parse({ ...config, botId: ' bot-1 ', secret: ' bot-secret ' })
    ).toEqual({ ...config, connectionStatus: 'offline' });
  });

  it.each(['offline', 'online', 'error'])('accepts the %s connection state', (connectionStatus) => {
    expect(WecomWebSocketAppSchema.parse({ ...config, connectionStatus }).connectionStatus).toBe(
      connectionStatus
    );
  });

  it.each(['AUTH_FAILED', 'NETWORK_ERROR', 'CONNECTION_CONFLICT'])(
    'preserves error metadata for %s',
    (errorCode) => {
      const lastReportedAt = new Date('2026-10-13T00:00:00Z');
      expect(
        WecomWebSocketAppSchema.parse({
          ...config,
          connectionStatus: 'error',
          connectionStatusMeta: { lastReportedAt, errorCode }
        }).connectionStatusMeta
      ).toEqual({ lastReportedAt, errorCode });
    }
  );

  it.each([
    { botId: '' },
    { botId: '  ' },
    { botId: 'b'.repeat(257) },
    { secret: '' },
    { secret: '  ' },
    { secret: 's'.repeat(1025) },
    { revision: 0 },
    { revision: -1 },
    { revision: 1.5 },
    { revision: '1' },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { connectionStatus: 'unknown' },
    { connectionStatusMeta: { lastReportedAt: '2026-10-13T00:00:00Z' } },
    { connectionStatusMeta: { lastReportedAt: new Date(), errorCode: 'CONNECTING' } }
  ])('rejects invalid stored configuration %j', (patch) => {
    expect(WecomWebSocketAppSchema.safeParse({ ...config, ...patch }).success).toBe(false);
  });

  it('accepts maximum credential lengths and a safe positive revision', () => {
    expect(
      WecomWebSocketAppSchema.safeParse({
        botId: 'b'.repeat(256),
        secret: 's'.repeat(1024),
        revision: Number.MAX_SAFE_INTEGER
      }).success
    ).toBe(true);
  });
});

describe('WecomAppSchema compatibility', () => {
  it('keeps webhook credentials separate from websocket credentials', () => {
    const webhook = { CallbackToken: 'callback-token', CallbackEncodingAesKey: 'callback-key' };
    expect(WecomAppSchema.parse(webhook)).toEqual(webhook);
    expect(WecomAppSchema.safeParse(config).success).toBe(false);
    expect(WecomWebSocketAppSchema.safeParse(webhook).success).toBe(false);
  });
});
