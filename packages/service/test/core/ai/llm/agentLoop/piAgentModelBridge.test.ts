import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  buildPiModel,
  getModelApiKey,
  getPiThinkingLevel,
  resolvePiReasoningEffort
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/modelBridge';

const createLlmModel = (overrides = {}) => ({
  modelId: '68ad85a7463006c963799a05',
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'plain-model',
  name: 'Plain Model',
  isActive: true,
  scope: 'system' as const,
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
    expect(getPiThinkingLevel(reasoningModel as any)).toBe('off');
    expect(getPiThinkingLevel(reasoningModel as any, null)).toBe('off');
    expect(resolvePiReasoningEffort(reasoningModel as any)).toBeUndefined();
    expect(resolvePiReasoningEffort(reasoningModel as any, null)).toBeUndefined();
    expect(getPiThinkingLevel(reasoningModel as any, 'high')).toBe('high');
    expect(getPiThinkingLevel(reasoningModel as any, 'none')).toBe('off');
    expect(resolvePiReasoningEffort(reasoningModel as any, 'none')).toBe('none');
    expect(getPiThinkingLevel(plainModel as any, 'high')).toBe('off');
    expect(getPiThinkingLevel(reasoningWithoutEffortModel as any, 'high')).toBe('off');

    const restrictedModel = createLlmModel({
      model: 'restricted-reasoning',
      config: {
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['low', 'high']
      }
    });
    expect(getPiThinkingLevel(restrictedModel as any, 'high')).toBe('high');
    // 未指定或不在模型支持列表内的档位（含旧 'none' / 'xhigh'）统一省略思考配置，走模型默认行为
    expect(getPiThinkingLevel(restrictedModel as any, 'xhigh')).toBe('off');
    expect(resolvePiReasoningEffort(restrictedModel as any, 'xhigh')).toBeUndefined();
    expect(getPiThinkingLevel(restrictedModel as any, null)).toBe('off');
    expect(resolvePiReasoningEffort(restrictedModel as any, null)).toBeUndefined();
    expect(getPiThinkingLevel(restrictedModel as any, 'none')).toBe('off');
    expect(resolvePiReasoningEffort(restrictedModel as any, 'none')).toBeUndefined();

    const binaryModel = createLlmModel({
      model: 'deepseek-flash',
      config: {
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['none', 'high']
      }
    });
    expect(getPiThinkingLevel(binaryModel as any, 'none')).toBe('off');
    expect(resolvePiReasoningEffort(binaryModel as any, 'none')).toBe('none');
    expect(resolvePiReasoningEffort(binaryModel as any, null)).toBeUndefined();

    const xhighOnlyModel = createLlmModel({
      model: 'gpt-5.5',
      config: {
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['xhigh']
      }
    });
    expect(getPiThinkingLevel(xhighOnlyModel as any, 'xhigh')).toBe('xhigh');
    expect(resolvePiReasoningEffort(xhighOnlyModel as any, 'xhigh')).toBe('xhigh');
    expect(getPiThinkingLevel(xhighOnlyModel as any, null)).toBe('off');
    expect(resolvePiReasoningEffort(xhighOnlyModel as any, null)).toBeUndefined();

    const emptyEffortModel = createLlmModel({
      model: 'empty-effort',
      config: {
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: []
      }
    });
    expect(getPiThinkingLevel(emptyEffortModel as any, 'high')).toBe('high');
    expect(resolvePiReasoningEffort(emptyEffortModel as any, 'high')).toBe('high');
    expect(buildPiModel(emptyEffortModel as any).compat?.supportsReasoningEffort).toBe(true);
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

  it('does not fall back to the AI Proxy token when a model endpoint has no auth', () => {
    const model = buildPiModel(
      createLlmModel({ model: 'no-auth-model', requestAuth: undefined }) as any
    );

    expect(model.baseUrl).toBe('https://api.example.com/v1');
    // null 会被 OpenAI SDK 解释为删除默认 Authorization。
    expect(model.headers?.Authorization).toBeNull();
    const apiKey = getModelApiKey(createLlmModel({ requestAuth: undefined }) as any);
    // 必须返回非空哨兵，阻止 pi-ai 回退宿主 OPENAI_API_KEY，且不能是代理令牌。
    expect(apiKey).toBeTruthy();
    expect(apiKey).not.toBe('test-aiproxy-token');
  });

  it('uses runtime maxTokens with model maxResponse cap', () => {
    expect(buildPiModel(plainModel as any, false, undefined, 123).maxTokens).toBe(123);
    expect(buildPiModel(plainModel as any, false, undefined, 9999).maxTokens).toBe(4096);
  });
});
