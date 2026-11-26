import { describe, expect, it, vi } from 'vitest';
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';
import { WechatRequestPolicyError } from '@fastgpt/service/support/outLink/wechat/request';

describe('ILinkClient', () => {
  it('preserves adjacent uint64 message IDs as exact strings', async () => {
    const client = new ILinkClient();
    vi.spyOn(client as any, 'post').mockResolvedValue(
      '{"msgs":[{"message_id":9007199254740992},{"message_id":9007199254740993}]}'
    );

    await expect(client.getUpdates('')).resolves.toMatchObject({
      msgs: [{ message_id: '9007199254740992' }, { message_id: '9007199254740993' }]
    });
  });

  it.each([false, true])('distinguishes timeout before and after headers (%s)', async (headers) => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, { signal }: RequestInit) => {
      const pending = new Promise<never>((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      return headers ? Promise.resolve({ text: () => pending }) : pending;
    });
    vi.stubGlobal('fetch', fetch);
    try {
      const polling = new ILinkClient().getUpdates('cursor');
      const result = headers
        ? expect(polling).rejects.toThrow('iLink POST ilink/bot/getupdates failed: AbortError')
        : expect(polling).resolves.toBeUndefined();
      await vi.advanceTimersByTimeAsync(headers ? 15_000 : 35_000);
      await result;
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('does not retry a request policy rejection when sending', async () => {
    const client = new ILinkClient();
    const error = new WechatRequestPolicyError('private_address');
    const post = vi.spyOn(client as any, 'post').mockRejectedValue(error);

    await expect(
      client.sendMessage({ to_user_id: 'user-1', text: 'hello', context_token: 'context-1' })
    ).rejects.toBe(error);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('retries sending once with the same client ID after a transient failure', async () => {
    vi.useFakeTimers();
    try {
      const client = new ILinkClient();
      const post = vi
        .spyOn(client as any, 'post')
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce('{"ret":0}');

      const sending = client.sendMessage({
        to_user_id: 'user-1',
        text: 'hello',
        context_token: 'context-1'
      });
      await vi.advanceTimersByTimeAsync(500);

      await expect(sending).resolves.toBeUndefined();
      expect(post).toHaveBeenCalledTimes(2);
      expect(post.mock.calls[0][1]).toBe(post.mock.calls[1][1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries when Wechat returns a non-zero result', async () => {
    vi.useFakeTimers();
    try {
      const client = new ILinkClient();
      const post = vi
        .spyOn(client as any, 'post')
        .mockResolvedValueOnce('{"ret":-1,"errmsg":"busy"}')
        .mockResolvedValueOnce('{"ret":0}');

      const sending = client.sendMessage({
        to_user_id: 'user-1',
        text: 'hello',
        context_token: 'context-1'
      });
      await vi.advanceTimersByTimeAsync(500);

      await expect(sending).resolves.toBeUndefined();
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws after the send retry also fails', async () => {
    vi.useFakeTimers();
    try {
      const client = new ILinkClient();
      const post = vi.spyOn(client as any, 'post').mockRejectedValue(new Error('network error'));

      const sending = client.sendMessage({
        to_user_id: 'user-1',
        text: 'hello',
        context_token: 'context-1'
      });
      const rejection = expect(sending).rejects.toThrow('network error');
      await vi.advanceTimersByTimeAsync(500);

      await rejection;
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('omits raw upstream HTML body on non-2xx responses while preserving error cause', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const text = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        body: { cancel },
        text
      })
    );
    try {
      const caught = await new ILinkClient().getQRCode().catch((err) => err);
      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toContain('iLink POST ilink/bot/get_bot_qrcode failed');
      expect(caught.message).toContain('HTTP 502 Bad Gateway');
      expect(caught.cause).toBeInstanceOf(Error);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(text).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('turns malformed 2xx HTML responses into safe protocol errors without body snippets', async () => {
    const html = '<html><body>Proxy Auth Required: secret-banner</body></html>';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(html)
      })
    );
    try {
      for (const action of [
        () => new ILinkClient().getQRCode(),
        () => new ILinkClient().getQRCodeStatus('qr-1')
      ]) {
        const caught = await action().catch((err) => err);
        expect(caught).toBeInstanceOf(Error);
        expect(caught.message).toContain('returned invalid JSON');
        expect(caught.message).not.toContain('<html>');
        expect(caught.message).not.toContain('secret-banner');
        expect(caught.stack ?? '').not.toContain('<html>');
        expect(caught.cause).toBeUndefined();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
