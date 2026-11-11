import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { CreateUsageProps } from '@fastgpt/global/support/wallet/usage/api';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

const mocks = vi.hoisted(() => ({
  resolveFormData: vi.fn(),
  clearDiskTempFiles: vi.fn(),
  authChatTargetCrud: vi.fn(),
  aiTranscriptions: vi.fn(),
  getDefaultModelData: vi.fn()
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
  getSystemModelHandle: async () => ({ getDefaultModelData: mocks.getDefaultModelData })
}));
vi.mock('@fastgpt/service/common/rateLimit/interface/member', () => ({
  assertMemberRateLimit: vi.fn(),
  MemberRateLimitPolicy: { Transcriptions: 'transcriptions' }
}));

import handler from '@/pages/api/v1/audio/transcriptions';

describe('audio transcription API', () => {
  const createUsageHandler = vi.fn<(data: CreateUsageProps) => Promise<void>>();
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
      query: {},
      body: {}
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
    const previousUsageHandler = global.createUsageHandler;
    global.createUsageHandler = createUsageHandler;
    onTestFinished(() => {
      global.createUsageHandler = previousUsageHandler;
    });
    createUsageHandler.mockResolvedValue(undefined);
    mocks.getDefaultModelData.mockReturnValue({
      modelId: '65f000000000000000000072',
      model: 'qwen3-asr-flash',
      name: 'Qwen3-ASR-Flash',
      provider: 'alibaba',
      type: ModelTypeEnum.stt,
      scope: ModelScopeEnum.system,
      pricing: { unitPrice: 0.2 },
      config: {}
    });
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
    expect(createUsageHandler).not.toHaveBeenCalled();
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
    expect(createUsageHandler).not.toHaveBeenCalled();
    expect(mocks.clearDiskTempFiles).toHaveBeenCalledWith([temporaryFile]);
  });

  it.each([
    { label: '77-token short recording', usage: { seconds: 3, total_tokens: 77 }, duration: 3 },
    {
      label: 'minute-long Qwen recording',
      usage: { seconds: 60, total_tokens: 1733 },
      duration: 60
    },
    { label: 'legacy token-only usage', usage: { total_tokens: 77 }, duration: 0 },
    { label: 'missing usage', usage: undefined, duration: 0 },
    { label: 'zero seconds', usage: { seconds: 0, total_tokens: 77 }, duration: 0 },
    { label: 'subsecond audio', usage: { seconds: 0.2, total_tokens: 77 }, duration: 0.2 }
  ])('records duration and actual STT price for $label', async ({ usage, duration }) => {
    mocks.aiTranscriptions.mockResolvedValue({ text: '测试文本', usage });

    const result = await invoke({
      appId: '68ad85a7463006c963799a05',
      chatId: 'chat',
      duration: 'forged-client-value'
    });

    // 保留真实计费函数和价格计算，仅在用量持久化入口捕获账单。
    expect(createUsageHandler).toHaveBeenCalledTimes(1);
    const bill = createUsageHandler.mock.calls[0][0];
    expect(bill).toMatchObject({
      teamId: 'team',
      tmbId: 'member',
      source: UsageSourceEnum.fastgpt,
      list: [
        {
          modelId: '65f000000000000000000072',
          duration,
          sttBilling: { type: 'duration', quantity: duration, unitPrice: 0.2, unitSize: 60 }
        }
      ]
    });
    expect(bill.totalPoints).toBeCloseTo((duration / 60) * 0.2, 10);
    expect(bill.list?.[0].amount).toBeCloseTo((duration / 60) * 0.2, 10);
    expect(result).toMatchObject({ status: 200, body: { code: 200, data: '测试文本' } });
    expect(mocks.clearDiskTempFiles).toHaveBeenCalledWith([temporaryFile]);
  });

  it('bills tokens according to the selected model even when seconds are present', async () => {
    const model = mocks.getDefaultModelData();
    mocks.getDefaultModelData.mockReturnValue({
      ...model,
      pricing: { type: 'tokens', unitPrice: 10 }
    });
    mocks.aiTranscriptions.mockResolvedValue({
      text: '测试文本',
      usage: { seconds: 3, total_tokens: 77 }
    });
    await invoke({ appId: '68ad85a7463006c963799a05', chatId: 'chat' });
    const bill = createUsageHandler.mock.calls[0][0];
    expect(bill.totalPoints).toBeCloseTo((77 / 1000000) * 10, 10);
    expect(bill.list?.[0]).toMatchObject({
      totalTokens: 77,
      sttBilling: { type: 'tokens', quantity: 77, unitPrice: 10, unitSize: 1000000 }
    });
    expect(bill.list?.[0]).not.toHaveProperty('duration');
    expect(mocks.getDefaultModelData).toHaveBeenCalledTimes(2);
  });

  it('does not bill token pricing from seconds when total_tokens is absent', async () => {
    mocks.getDefaultModelData.mockReturnValue({
      ...mocks.getDefaultModelData(),
      pricing: { type: 'tokens', unitPrice: 10 }
    });
    mocks.aiTranscriptions.mockResolvedValue({ text: '测试文本', usage: { seconds: 77 } });
    await invoke({ appId: '68ad85a7463006c963799a05', chatId: 'chat' });
    expect(createUsageHandler.mock.calls[0][0]).toMatchObject({
      totalPoints: 0,
      list: [{ totalTokens: 0 }]
    });
  });

  it('does not create a bill when upstream transcription fails', async () => {
    const error = new Error('upstream failed');
    mocks.aiTranscriptions.mockRejectedValue(error);

    const result = await invoke({
      appId: '68ad85a7463006c963799a05',
      chatId: 'chat',
      duration: 'forged-client-value'
    });

    expect(createUsageHandler).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 500, body: { code: 500 } });
    expect(mocks.clearDiskTempFiles).toHaveBeenCalledWith([temporaryFile]);
  });
});
