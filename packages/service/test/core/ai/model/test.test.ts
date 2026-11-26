import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Readable } from 'node:stream';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';

const mocks = vi.hoisted(() => ({
  getAIApi: vi.fn(),
  createSpeech: vi.fn(),
  createLLMResponse: vi.fn(),
  getVectors: vi.fn(),
  aiTranscriptions: vi.fn(),
  reRankRecall: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config')>();
  return {
    ...actual,
    getAIApi: mocks.getAIApi,
    getAiproxyScopeHeaders: vi.fn(() => ({}))
  };
});
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: mocks.createLLMResponse
}));
vi.mock('@fastgpt/service/core/ai/embedding', () => ({ getVectors: mocks.getVectors }));
vi.mock('@fastgpt/service/core/ai/audio/transcriptions', () => ({
  aiTranscriptions: mocks.aiTranscriptions
}));
vi.mock('@fastgpt/service/core/ai/rerank', () => ({ reRankRecall: mocks.reRankRecall }));

import {
  getSampleTestAudioBuffer,
  MODEL_TEST_TIMEOUT_MS,
  testModelConnection
} from '../../../../core/ai/model/test';

const ttsModel = {
  modelId: 'tts-timeout-test',
  type: ModelTypeEnum.tts,
  provider: 'OpenAI',
  model: 'tts-1',
  name: 'TTS test',
  scope: 'system',
  isActive: true,
  config: { voices: [{ label: 'Alloy', value: 'alloy' }] }
} as AIModelDataType;

const createModel = (type: ModelTypeEnum, config = {}) =>
  ({
    modelId: `model-status-${type}-test`,
    type,
    provider: 'OpenAI',
    model: `${type}-test`,
    name: `${type} test`,
    scope: 'system',
    isActive: true,
    config
  }) as AIModelDataType;

const waitForAbort = (signal: AbortSignal, onAbort?: () => void) =>
  new Promise<void>((_, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        onAbort?.();
        reject(new Error('request aborted'));
      },
      { once: true }
    );
  });

describe('testModelConnection request timeout', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.getAIApi.mockReturnValue({
      requestMeta: { baseUrl: 'https://provider.example/v1' },
      ai: { audio: { speech: { create: mocks.createSpeech } } }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes one 60-second timeout and aborts the provider request at the deadline', async () => {
    vi.useFakeTimers();
    mocks.createSpeech.mockImplementation((_body: unknown, options: { signal: AbortSignal }) =>
      waitForAbort(options.signal)
    );

    const onRequestStart = vi.fn();
    const probe = testModelConnection({ model: ttsModel, onRequestStart });
    const expectation = expect(probe).rejects.toThrow(
      `Model test timed out after ${MODEL_TEST_TIMEOUT_MS}ms`
    );
    await vi.advanceTimersByTimeAsync(MODEL_TEST_TIMEOUT_MS);

    await expectation;
    expect(mocks.getAIApi).toHaveBeenCalledWith({ timeout: MODEL_TEST_TIMEOUT_MS });
    expect(mocks.createSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ model: ttsModel.model }),
      expect.objectContaining({ signal: expect.any(AbortSignal), maxRetries: 0 })
    );
    expect(mocks.createSpeech.mock.calls[0][1].signal.aborted).toBe(true);
    expect(onRequestStart).toHaveBeenCalledTimes(1);
  });

  it.each([ModelTypeEnum.llm, ModelTypeEnum.embedding, ModelTypeEnum.stt, ModelTypeEnum.rerank])(
    'passes an abort signal to the %s transport',
    async (type) => {
      vi.useFakeTimers();
      const model = createModel(type);

      if (type === ModelTypeEnum.llm) {
        mocks.createLLMResponse.mockImplementation(({ signal }: { signal: AbortSignal }) =>
          waitForAbort(signal)
        );
      } else if (type === ModelTypeEnum.embedding) {
        mocks.getVectors.mockImplementation(({ signal }: { signal: AbortSignal }) =>
          waitForAbort(signal)
        );
      } else if (type === ModelTypeEnum.stt) {
        mocks.aiTranscriptions.mockImplementation(
          ({ fileStream, signal }: { fileStream: Readable; signal: AbortSignal }) =>
            waitForAbort(signal, () => fileStream.destroy())
        );
      } else {
        mocks.reRankRecall.mockImplementation(({ signal }: { signal: AbortSignal }) =>
          waitForAbort(signal)
        );
      }

      const probe = testModelConnection({
        model,
        ...(type === ModelTypeEnum.llm ? { teamId: 'team-test' } : {})
      });
      const expectation = expect(probe).rejects.toThrow(
        `Model test timed out after ${MODEL_TEST_TIMEOUT_MS}ms`
      );

      await vi.advanceTimersByTimeAsync(MODEL_TEST_TIMEOUT_MS);
      await expectation;

      const requestOptions =
        type === ModelTypeEnum.llm
          ? mocks.createLLMResponse.mock.calls[0][0]
          : type === ModelTypeEnum.embedding
            ? mocks.getVectors.mock.calls[0][0]
            : type === ModelTypeEnum.stt
              ? mocks.aiTranscriptions.mock.calls[0][0]
              : mocks.reRankRecall.mock.calls[0][0];
      expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
      expect(requestOptions.signal.aborted).toBe(true);
    }
  );

  it('streams a structurally complete MPEG-1 Layer 3 sample audio for STT without filesystem access', async () => {
    const sampleBuffer = getSampleTestAudioBuffer();
    expect(sampleBuffer.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfb]));
    expect(sampleBuffer.length).toBeLessThan(8192);

    // 逐帧校验 MPEG-1 Layer 3 帧头与总字节边界，避免截断或损坏的 Base64 常量回归
    const bitrateTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    const sampleRateTable = [44100, 48000, 32000, 0];
    let offset = 0;
    let frameCount = 0;
    while (offset < sampleBuffer.length) {
      expect(offset + 4).toBeLessThanOrEqual(sampleBuffer.length);
      const b0 = sampleBuffer[offset];
      const b1 = sampleBuffer[offset + 1];
      const b2 = sampleBuffer[offset + 2];
      // Frame sync (11 bits) + MPEG-1 (version=3) + Layer 3 (layer=1)
      expect(b0).toBe(0xff);
      expect((b1 & 0xfe) === 0xfa).toBe(true);
      const bitrateKbps = bitrateTable[(b2 >> 4) & 0x0f];
      const sampleRate = sampleRateTable[(b2 >> 2) & 0x03];
      const padding = (b2 >> 1) & 0x01;
      expect(bitrateKbps).toBeGreaterThan(0);
      expect(sampleRate).toBeGreaterThan(0);
      const frameLen = Math.floor((144 * bitrateKbps * 1000) / sampleRate) + padding;
      offset += frameLen;
      frameCount += 1;
    }
    expect(offset).toBe(sampleBuffer.length);
    expect(frameCount).toBeGreaterThan(20);

    const receivedChunks: Buffer[] = [];
    mocks.aiTranscriptions.mockImplementation(async ({ fileStream }: { fileStream: Readable }) => {
      for await (const chunk of fileStream) {
        receivedChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return { text: 'ok' };
    });

    await testModelConnection({ model: createModel(ModelTypeEnum.stt) });

    expect(mocks.aiTranscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'test.mp3'
      })
    );
    expect(Buffer.concat(receivedChunks)).toEqual(sampleBuffer);
  });
});
