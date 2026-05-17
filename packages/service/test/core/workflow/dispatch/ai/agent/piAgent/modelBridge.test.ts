import { beforeEach, describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  buildPiModel,
  getPiThinkingLevel
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/modelBridge';

const createLlmModel = (overrides = {}) => ({
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'plain-model',
  name: 'Plain Model',
  isActive: true,
  maxContext: 128000,
  maxResponse: 4096,
  quoteMaxToken: 1000,
  functionCall: true,
  toolChoice: true,
  reasoning: false,
  reasoningEffort: false,
  requestUrl: 'https://api.example.com/v1/chat/completions',
  requestAuth: 'model-key',
  ...overrides
});

describe('PiAgent model bridge', () => {
  beforeEach(() => {
    const plainModel = createLlmModel();
    const reasoningModel = createLlmModel({
      model: 'reasoning-model',
      name: 'Reasoning Model',
      reasoning: true,
      reasoningEffort: true
    });
    const reasoningWithoutEffortModel = createLlmModel({
      model: 'reasoning-without-effort',
      name: 'Reasoning Without Effort',
      reasoning: true,
      reasoningEffort: false
    });

    global.llmModelMap = new Map([
      [plainModel.model, plainModel],
      [plainModel.name, plainModel],
      [reasoningModel.model, reasoningModel],
      [reasoningModel.name, reasoningModel],
      [reasoningWithoutEffortModel.model, reasoningWithoutEffortModel],
      [reasoningWithoutEffortModel.name, reasoningWithoutEffortModel]
    ]) as any;
    global.systemDefaultModel = {
      llm: plainModel
    } as any;
  });

  it('maps FastGPT reasoning effort to pi-agent-core thinking levels', () => {
    expect(getPiThinkingLevel('reasoning-model')).toBe('medium');
    expect(getPiThinkingLevel('reasoning-model', null)).toBe('medium');
    expect(getPiThinkingLevel('reasoning-model', 'high')).toBe('high');
    expect(getPiThinkingLevel('reasoning-model', 'none')).toBe('off');
    expect(getPiThinkingLevel('plain-model', 'high')).toBe('off');
    expect(getPiThinkingLevel('reasoning-without-effort', 'high')).toBe('off');
  });

  it('passes reasoning model metadata into pi-ai model config', () => {
    const model = buildPiModel('reasoning-model', true, {
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
    const model = buildPiModel('plain-model', false, {
      baseUrl: 'https://proxy.example.com/v1'
    } as any);

    expect(model.baseUrl).toBe('https://api.example.com/v1');
    expect(model.headers).toEqual({
      Authorization: 'Bearer model-key'
    });
  });

  it('uses default OpenAI baseUrl when user key has no baseUrl', () => {
    const model = buildPiModel('plain-model', false, {
      key: 'user-key'
    } as any);

    expect(model.baseUrl).toBe('https://api.openai.com/v1');
    expect(model.headers).toEqual({
      Authorization: 'Bearer user-key'
    });
  });

  it('does not advertise reasoning effort for models that only expose reasoning output', () => {
    const model = buildPiModel('reasoning-without-effort');

    expect(model.reasoning).toBe(true);
    expect(model.compat?.supportsReasoningEffort).toBe(false);
  });
});
