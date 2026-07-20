import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  buildPiModel,
  getPiThinkingLevel
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/modelBridge';

const createLlmModel = (overrides = {}) => ({
  id: 'plain-model',
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
  ...overrides
});

describe('PiAgent provider model bridge', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    const plainModel = createLlmModel();
    const reasoningModel = createLlmModel({
      id: 'reasoning-model',
      model: 'reasoning-model',
      name: 'Reasoning Model',
      reasoning: true,
      reasoningEffort: true
    });
    const reasoningWithoutEffortModel = createLlmModel({
      id: 'reasoning-without-effort',
      model: 'reasoning-without-effort',
      name: 'Reasoning Without Effort',
      reasoning: true,
      reasoningEffort: false
    });

    global.llmModelIdMap = new Map([
      [plainModel.id, plainModel],
      [reasoningModel.id, reasoningModel],
      [reasoningWithoutEffortModel.id, reasoningWithoutEffortModel]
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

  it('falls back to env baseUrl when user key is missing', () => {
    const model = buildPiModel('plain-model', false, {
      baseUrl: 'https://proxy.example.com/v1'
    } as any);

    // requestUrl/requestAuth were removed from models (managed by Channels);
    // without a user-supplied key, the env-configured baseUrl is used.
    expect(model.baseUrl).toBe('https://api.openai.com/v1');
    // No apiKey and no aiproxy relay → headers stay empty (pi-ai rejects key-less requests).
    expect(model.headers).toEqual({});
  });

  it('injects aiproxy relay scope headers into pi-ai request headers', async () => {
    const systemModel = createLlmModel({ id: 'system-model', isSystem: true });
    const privateModel = createLlmModel({ id: 'private-model', tmbId: 'tmb_1' });
    global.llmModelIdMap = new Map([
      [systemModel.id, systemModel],
      [privateModel.id, privateModel]
    ]) as any;

    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
    vi.resetModules();
    const { buildPiModel: buildPiModelFresh } =
      await import('@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/modelBridge');

    // System model → global scope on the aiproxy relay (design §2.9).
    const system = buildPiModelFresh('system-model');
    expect(system.headers).toMatchObject({
      'X-Aiproxy-Group-Channel-Mode': 'global'
    });

    // Private model → own scope + owner group on the aiproxy relay.
    const privateM = buildPiModelFresh('private-model');
    expect(privateM.headers).toMatchObject({
      'X-Aiproxy-Group': 'fastgpt:tmb:tmb_1',
      'X-Aiproxy-Group-Channel-Mode': 'own'
    });

    // User-key requests never hit the relay → no scope headers.
    const userKeyModel = buildPiModelFresh('system-model', false, {
      key: 'user-key',
      baseUrl: 'https://api.openai.com/v1'
    } as any);
    expect(userKeyModel.headers).toEqual({
      Authorization: 'Bearer user-key'
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

  it('uses runtime maxTokens with model maxResponse cap', () => {
    expect(buildPiModel('plain-model', false, undefined, 123).maxTokens).toBe(123);
    expect(buildPiModel('plain-model', false, undefined, 9999).maxTokens).toBe(4096);
  });
});
