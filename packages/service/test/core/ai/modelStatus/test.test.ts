import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';

const mocks = vi.hoisted(() => ({
  getAIApi: vi.fn(),
  createSpeech: vi.fn(),
  createLLMResponse: vi.fn(),
  getVectors: vi.fn(),
  aiTranscriptions: vi.fn(),
  reRankRecall: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/config', () => ({ getAIApi: mocks.getAIApi }));
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: mocks.createLLMResponse
}));
vi.mock('@fastgpt/service/core/ai/embedding', () => ({ getVectors: mocks.getVectors }));
vi.mock('@fastgpt/service/core/ai/audio/transcriptions', () => ({
  aiTranscriptions: mocks.aiTranscriptions
}));
vi.mock('@fastgpt/service/core/ai/rerank', () => ({ reRankRecall: mocks.reRankRecall }));
vi.mock('fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('fs')>();
  return {
    ...fs,
    createReadStream: vi.fn(() => ({ destroy: vi.fn() }))
  };
});

import {
  MODEL_STATUS_REQUEST_TIMEOUT_MS,
  testSystemModel
} from '../../../../core/ai/modelStatus/test';

const ttsModel = {
  modelId: 'tts-timeout-test',
  type: ModelTypeEnum.tts,
  provider: 'OpenAI',
  model: 'tts-1',
  name: 'TTS test',
  scope: 'system',
  isActive: true,
  config: { voices: [{ label: 'Alloy', value: 'alloy' }] }
} as SystemModelDataType;

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
  }) as SystemModelDataType;

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

describe('testSystemModel request timeout', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.getAIApi.mockReturnValue({
      ai: { audio: { speech: { create: mocks.createSpeech } } }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes one 60-second timeout and aborts the provider request at the deadline', async () => {
    vi.useFakeTimers();
    mocks.createSpeech.mockImplementation(
      (_body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('request aborted')), {
            once: true
          });
        })
    );

    const onRequestStart = vi.fn();
    const probe = testSystemModel({ model: ttsModel, onRequestStart });
    const expectation = expect(probe).rejects.toThrow(
      `Model test timed out after ${MODEL_STATUS_REQUEST_TIMEOUT_MS}ms`
    );
    await vi.advanceTimersByTimeAsync(MODEL_STATUS_REQUEST_TIMEOUT_MS);

    await expectation;
    expect(mocks.getAIApi).toHaveBeenCalledWith({ timeout: MODEL_STATUS_REQUEST_TIMEOUT_MS });
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
      const model = createModel(
        type,
        type === ModelTypeEnum.tts ? { voices: [{ label: 'Alloy', value: 'alloy' }] } : {}
      );

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
          ({ fileStream, signal }: { fileStream: NodeJS.ReadableStream; signal: AbortSignal }) =>
            waitForAbort(signal, () => fileStream.destroy())
        );
      } else {
        mocks.reRankRecall.mockImplementation(({ signal }: { signal: AbortSignal }) =>
          waitForAbort(signal)
        );
      }

      const probe = testSystemModel({
        model,
        ...(type === ModelTypeEnum.llm ? { teamId: 'team-test' } : {})
      });
      const expectation = expect(probe).rejects.toThrow(
        `Model test timed out after ${MODEL_STATUS_REQUEST_TIMEOUT_MS}ms`
      );

      await vi.advanceTimersByTimeAsync(MODEL_STATUS_REQUEST_TIMEOUT_MS);
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
});
