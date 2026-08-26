import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  buildPiModel,
  getPiThinkingLevel
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/modelBridge';

const createLlmModel = (overrides = {}) => ({
  modelId: '68ad85a7463006c963799a05',
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'plain-model',
  name: 'Plain Model',
  isActive: true,
  isSystem: true,
  isCustom: false,
  requestUrl: 'https://api.example.com/v1/chat/completions',
  requestAuth: 'model-key',
  ...overrides,
  config: {
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 1000,
    functionCall: true,
    toolChoice: true,
    reasoning: false,
    reasoningEffort: false,
    ...(overrides as any).config
  }
});

const plainModel = createLlmModel();
const reasoningModel = createLlmModel({
  model: 'reasoning-model',
  name: 'Reasoning Model',
  config: { reasoning: true, reasoningEffort: true }
});
const reasoningWithoutEffortModel = createLlmModel({
  model: 'reasoning-without-effort',
  name: 'Reasoning Without Effort',
  config: { reasoning: true, reasoningEffort: false }
});

describe('PiAgent provider model bridge', () => {
  it('maps FastGPT reasoning effort to pi-agent-core thinking levels', () => {
    expect(getPiThinkingLevel(reasoningModel as any)).toBe('medium');
    expect(getPiThinkingLevel(reasoningModel as any, null)).toBe('medium');
    expect(getPiThinkingLevel(reasoningModel as any, 'high')).toBe('high');
    expect(getPiThinkingLevel(reasoningModel as any, 'none')).toBe('off');
    expect(getPiThinkingLevel(plainModel as any, 'high')).toBe('off');
    expect(getPiThinkingLevel(reasoningWithoutEffortModel as any, 'high')).toBe('off');
  });

  it('passes reasoning model metadata into pi-ai model config', () => {
    const model = buildPiModel(reasoningModel as any, true, {
      key: 'user-key',
      baseUrl: 'https://proxy.example.com/v1/chat/completions'
    } as any);

    expect(model).toMatchObject({
      id: 'reasoning-model',
      name: 'Reasoning Model',
      baseUrl: 'https://proxy.example.com/v1',
      reasoning: true,
      input: ['text', 'image'],
      headers: {
        Authorization: 'Bearer user-key'
      },
      compat: {
        supportsReasoningEffort: true,
        maxTokensField: 'max_tokens'
      }
    });
  });

  it('ignores user baseUrl when user key is missing', () => {
    const model = buildPiModel(plainModel as any, false, {
      baseUrl: 'https://proxy.example.com/v1'
    } as any);

    expect(model.baseUrl).toBe('https://api.example.com/v1');
    expect(model.headers).toEqual({
      Authorization: 'Bearer model-key'
    });
  });

  it('uses default OpenAI baseUrl when user key has no baseUrl', () => {
    const model = buildPiModel(plainModel as any, false, {
      key: 'user-key'
    } as any);

    expect(model.baseUrl).toBe('https://api.openai.com/v1');
    expect(model.headers).toEqual({
      Authorization: 'Bearer user-key'
    });
  });

  it('does not advertise reasoning effort for models that only expose reasoning output', () => {
    const model = buildPiModel(reasoningWithoutEffortModel as any);

    expect(model.reasoning).toBe(true);
    expect(model.compat?.supportsReasoningEffort).toBe(false);
  });

  it('uses runtime maxTokens with model maxResponse cap', () => {
    expect(buildPiModel(plainModel as any, false, undefined, 123).maxTokens).toBe(123);
    expect(buildPiModel(plainModel as any, false, undefined, 9999).maxTokens).toBe(4096);
  });
});
