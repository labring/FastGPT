import { describe, expect, it, vi } from 'vitest';
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';

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
});
