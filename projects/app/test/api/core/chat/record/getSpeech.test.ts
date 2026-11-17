import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
import { MongoTTSBuffer } from '@fastgpt/service/common/buffer/tts/schema';

vi.unmock('@fastgpt/service/common/logger');

const mocks = vi.hoisted(() => ({
  authChatTargetCrud: vi.fn(),
  authTargetModelResource: vi.fn(),
  getTTSModelData: vi.fn(),
  text2Speech: vi.fn(),
  jsonRes: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/auth', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
}));
vi.mock('@fastgpt/service/core/app/resource/service', () => ({
  authTargetModelResource: mocks.authTargetModelResource
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getSystemModelHandle: async () => ({
    getModelData: mocks.getTTSModelData,
    getTTSModelData: mocks.getTTSModelData
  }),
  getTeamModelHandle: async () => ({
    getModelData: mocks.getTTSModelData,
    getTTSModelData: mocks.getTTSModelData
  })
}));
vi.mock('@fastgpt/service/core/ai/audio/speech', () => ({ text2Speech: mocks.text2Speech }));
vi.mock('@fastgpt/service/common/response', () => ({ jsonRes: mocks.jsonRes }));
vi.mock('@/service/support/wallet/usage/push', () => ({ pushAudioSpeechUsage: vi.fn() }));

import handler from '@/pages/api/core/chat/record/getSpeech';

describe('getSpeech model resource permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authChatTargetCrud.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      isRoot: false,
      authType: 'token',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '65f000000000000000000071'
    });
    mocks.authTargetModelResource.mockRejectedValue(ERROR_ENUM.unAuthModel);
    mocks.getTTSModelData.mockReturnValue({
      modelId: 'model-id',
      config: { voices: [{ label: 'Voice', value: 'voice-id' }] }
    });
  });

  it('rejects a model that is not declared by the published App version', async () => {
    await handler(
      {
        headers: {},
        body: {
          appId: '65f000000000000000000071',
          ttsConfig: { type: 'model', modelId: 'model-id', voice: 'voice-id' },
          input: 'hello'
        }
      } as any,
      { end: vi.fn() } as any
    );

    expect(mocks.jsonRes).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ error: ERROR_ENUM.unAuthModel })
    );
    expect(mocks.authTargetModelResource).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: ChatSourceTypeEnum.app,
        modelId: 'model-id',
        teamId: 'team-id',
        tmbId: 'tmb-id',
        isRoot: false,
        authType: 'token',
        handle: expect.anything()
      })
    );
    expect(mocks.text2Speech).not.toHaveBeenCalled();
  });

  it('enforces model resource check when only legacy model is configured', async () => {
    await handler(
      {
        headers: {},
        body: {
          appId: '65f000000000000000000071',
          ttsConfig: { type: 'model', model: 'legacy-tts', voice: 'voice-id' },
          input: 'hello'
        }
      } as any,
      { end: vi.fn() } as any
    );

    expect(mocks.jsonRes).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ error: ERROR_ENUM.unAuthModel })
    );
    expect(mocks.authTargetModelResource).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: ChatSourceTypeEnum.app,
        modelId: 'model-id',
        teamId: 'team-id',
        tmbId: 'tmb-id',
        isRoot: false,
        authType: 'token',
        handle: expect.anything()
      })
    );
    expect(mocks.text2Speech).not.toHaveBeenCalled();
  });

  it.each(['stream', 'cached', 'error-before-audio', 'error-after-audio'])(
    'declares audio so the API entry never appends default JSON: %s',
    async (scenario) => {
      const { createApiEntry } = await vi.importActual<
        typeof import('@fastgpt/service/common/http/entry')
      >('@fastgpt/service/common/http/entry');
      const { jsonRes } = await vi.importActual<typeof import('@fastgpt/service/common/response')>(
        '@fastgpt/service/common/response'
      );
      mocks.jsonRes.mockImplementation(jsonRes);
      mocks.authTargetModelResource.mockResolvedValue(undefined);
      const cached = { buffer: { buffer: new TextEncoder().encode('cached-audio').buffer } };
      const findBuffer = vi
        .spyOn(MongoTTSBuffer, 'findOne')
        .mockResolvedValue(scenario === 'cached' ? cached : null);
      const headers = new Map<string, unknown>();
      const chunks: Buffer[] = [];
      const res = Object.assign(new PassThrough(), {
        headersSent: false,
        statusCode: 200,
        setHeader(name: string, value: unknown) {
          headers.set(name.toLowerCase(), value);
        },
        getHeader(name: string) {
          return headers.get(name.toLowerCase());
        },
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(body: unknown) {
          this.setHeader('Content-Type', 'application/json');
          this.end(JSON.stringify(body));
        }
      });
      res.on('data', (chunk) => {
        res.headersSent = true;
        chunks.push(chunk);
      });
      const req = Object.assign(new IncomingMessage(new Socket()), {
        method: 'POST',
        url: '/api/core/chat/record/getSpeech',
        query: {},
        body: {
          appId: '65f000000000000000000071',
          ttsConfig: { type: 'model', modelId: 'model-id', voice: 'voice-id' },
          input: 'hello'
        }
      });
      onTestFinished(() => {
        findBuffer.mockRestore();
        res.destroy();
        req.socket.destroy();
      });
      mocks.text2Speech.mockImplementation(async ({ onError }) => {
        // 首包延后到入口已返回之后，验证只设置响应类型也不会触发默认 JSON。
        setImmediate(() => {
          if (scenario === 'error-before-audio') {
            onError(new Error('TTS failed'));
            return;
          }
          res.write('audio-start');
          setImmediate(() => {
            if (scenario === 'error-after-audio') onError(new Error('TTS stream failed'));
            else res.end('audio-end');
          });
        });
      });

      const { apiI18n } = await import('@/service/middleware/i18n');
      await createApiEntry({ requestI18n: apiI18n })(handler as any)(req, res as any);

      expect(res.getHeader('Content-Type')).toBe('audio/mpeg');
      expect(mocks.jsonRes).not.toHaveBeenCalled();
      if (scenario !== 'cached') {
        expect(chunks).toHaveLength(0);
        expect(res.writableEnded).toBe(false);
      }
      if (scenario === 'error-after-audio') {
        await expect(finished(res, { cleanup: true })).rejects.toThrow();
        expect(Buffer.concat(chunks).toString()).toBe('audio-start');
        expect(mocks.jsonRes).not.toHaveBeenCalled();
      } else {
        await finished(res, { cleanup: true });
        const body = Buffer.concat(chunks).toString();
        if (scenario === 'error-before-audio') {
          expect(res.statusCode).toBe(500);
          expect(res.getHeader('Content-Type')).toBe('application/json');
          expect(JSON.parse(body).message).toBe('TTS failed');
          expect(mocks.jsonRes).toHaveBeenCalledOnce();
        } else {
          expect(body).toBe(scenario === 'cached' ? 'cached-audio' : 'audio-startaudio-end');
          expect(mocks.jsonRes).not.toHaveBeenCalled();
        }
      }
      if (scenario === 'cached') expect(mocks.text2Speech).not.toHaveBeenCalled();
    }
  );
});
