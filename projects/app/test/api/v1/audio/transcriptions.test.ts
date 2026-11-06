import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

const mocks = vi.hoisted(() => ({
  resolveFormData: vi.fn(),
  clearDiskTempFiles: vi.fn(),
  authChatTargetCrud: vi.fn(),
  aiTranscriptions: vi.fn(),
  pushWhisperUsage: vi.fn()
}));

vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/common/response');
vi.unmock('@fastgpt/service/common/logger');
// 使用真实 HTTP 错误入口，省略与音频入参无关的 Next CORS/CSRF 适配。
vi.mock('@/service/middleware/entry', async () => {
  const { createApiEntry } = await import('@fastgpt/service/common/http/entry');
  return { NextAPI: createApiEntry({}) };
});
vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: { resolveFormData: mocks.resolveFormData, clearDiskTempFiles: mocks.clearDiskTempFiles }
}));
vi.mock('@fastgpt/service/core/chat/auth', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
}));
vi.mock('@fastgpt/service/core/ai/audio/transcriptions', () => ({
  aiTranscriptions: mocks.aiTranscriptions
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getSystemModelHandle: async () => ({ getDefaultModelData: () => ({ model: 'test-stt' }) })
}));
vi.mock('@fastgpt/service/common/rateLimit/interface/member', () => ({
  assertMemberRateLimit: vi.fn(),
  MemberRateLimitPolicy: { Transcriptions: 'transcriptions' }
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  pushWhisperUsage: mocks.pushWhisperUsage
}));

import handler from '@/pages/api/v1/audio/transcriptions';

describe('audio transcription request errors', () => {
  const temporaryFile = '/tmp/transcriptions-test.mp3';
  const invoke = async (data: Record<string, unknown>) => {
    mocks.resolveFormData.mockResolvedValue({
      data,
      fileMetadata: { path: temporaryFile, originalname: 'test.mp3' },
      getReadStream: () => Readable.from('test audio')
    });
    const req: NodeApiRequest = Object.assign(new IncomingMessage(new Socket()), {
      method: 'POST',
      url: '/api/v1/audio/transcriptions',
      query: {}
    });
    const res: NodeApiResponse = Object.assign(new ServerResponse(req), {
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json: vi.fn((body: unknown) => res.end(JSON.stringify(body)))
    });
    onTestFinished(() => {
      res.destroy();
      req.socket.destroy();
    });
    await handler(req as any, res as any);
    return { status: res.statusCode, body: vi.mocked(res.json).mock.calls[0][0] as any };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authChatTargetCrud.mockResolvedValue({ teamId: 'team', tmbId: 'member' });
    mocks.aiTranscriptions.mockResolvedValue({ text: 'recognized words' });
  });

  it.each([
    { name: 'missing', chatId: undefined },
    { name: 'empty', chatId: '' },
    { name: 'too long', chatId: 'c'.repeat(1025) }
  ])('returns structured 400 for $name chatId', async ({ chatId }) => {
    const result = await invoke({ appId: '68ad85a7463006c963799a05', chatId, duration: 1 });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      code: 400,
      message: 'Data validation error',
      zodError: expect.any(Array)
    });
    expect(mocks.authChatTargetCrud).not.toHaveBeenCalled();
    expect(mocks.aiTranscriptions).not.toHaveBeenCalled();
    expect(mocks.clearDiskTempFiles).toHaveBeenCalledWith([temporaryFile]);
  });

  it('accepts a 1024-character chatId and always cleans the uploaded file', async () => {
    const chatId = 'c'.repeat(1024);
    const result = await invoke({ appId: '68ad85a7463006c963799a05', chatId, duration: 1 });
    expect(result).toMatchObject({ status: 200, body: { code: 200, data: 'recognized words' } });
    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(expect.objectContaining({ chatId }));
    expect(mocks.clearDiskTempFiles).toHaveBeenCalledWith([temporaryFile]);
  });

  it('preserves authorization errors instead of converting them to parameter errors', async () => {
    mocks.authChatTargetCrud.mockRejectedValue(ChatErrEnum.unAuthChat);
    const result = await invoke({ appId: '68ad85a7463006c963799a05', chatId: 'chat', duration: 1 });
    expect(result).toMatchObject({ status: 500, body: { code: 504000 } });
    expect(mocks.aiTranscriptions).not.toHaveBeenCalled();
    expect(mocks.clearDiskTempFiles).toHaveBeenCalledWith([temporaryFile]);
  });
});
