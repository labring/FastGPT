import { Readable } from 'node:stream';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSandboxRuntimeSession: vi.fn(),
  getSandboxClient: vi.fn()
}));

vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime', () => ({
  buildSandboxClientQueryFromChatSource: vi.fn(() => ({ sandboxId: 'sbx-1' }))
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@fastgpt/service/core/ai/sandbox/application/runtime/client')
  >()),
  getSandboxClient: mocks.getSandboxClient
}));

import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';

describe('withAuthorizedSandboxClient', () => {
  const recover = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });
    mocks.getSandboxClient.mockResolvedValue({
      recover,
      close
    });
  });

  it('recovers and retries JSON-parsed requests even when req.readableEnded is true', async () => {
    const req = {
      method: 'POST',
      body: { path: '.' },
      readableEnded: true
    } as any;
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ENOTCONN: Transport endpoint is not connected'))
      .mockResolvedValueOnce('ok');

    await expect(withAuthorizedSandboxClient({ req, chatId: 'chat-1' }, fn)).resolves.toBe('ok');
    expect(recover).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
  });

  it('recovers raw streaming uploads only before the request stream is consumed', async () => {
    const unconsumedReq = Readable.from([Buffer.from('payload')]);
    Object.assign(unconsumedReq, { method: 'POST' });
    const fnBeforeRead = vi
      .fn()
      .mockRejectedValueOnce(new Error('ENOTCONN: Transport endpoint is not connected'))
      .mockResolvedValueOnce('uploaded');

    await expect(
      withAuthorizedSandboxClient({ req: unconsumedReq as any, chatId: 'chat-1' }, fnBeforeRead)
    ).resolves.toBe('uploaded');
    expect(recover).toHaveBeenCalledOnce();

    recover.mockClear();
    const consumedReq = Readable.from([Buffer.from('payload')]);
    Object.assign(consumedReq, { method: 'POST' });
    for await (const _chunk of consumedReq) {
      // consume stream
    }
    await expect(
      withAuthorizedSandboxClient({ req: consumedReq as any, chatId: 'chat-1' }, async () => {
        throw new Error('ENOTCONN: Transport endpoint is not connected');
      })
    ).rejects.toThrow('ENOTCONN');
    expect(recover).not.toHaveBeenCalled();
  });

  it('respects custom canRetry guard (such as download headersSent)', async () => {
    let headersSent = false;
    const req = { method: 'POST', body: { path: '.' }, readableEnded: true } as any;

    await expect(
      withAuthorizedSandboxClient(
        { req, chatId: 'chat-1', canRetry: () => !headersSent },
        async () => {
          headersSent = true;
          throw new Error('ENOTCONN: Transport endpoint is not connected');
        }
      )
    ).rejects.toThrow('ENOTCONN');
    expect(recover).not.toHaveBeenCalled();
  });
});
