import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { mergePiAgentPayload } from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/payload';

const MODEL_ID = 'gpt-5-id';

const createModel = (overrides: Record<string, unknown> = {}) =>
  ({
    id: MODEL_ID,
    type: ModelTypeEnum.llm,
    provider: 'openai',
    model: 'gpt-5',
    name: 'GPT-5',
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 4096,
    maxTemperature: 2,
    showTopP: true,
    showStopSign: true,
    responseFormatList: ['json_schema'],
    functionCall: true,
    toolChoice: true,
    ...overrides
  }) as any;

const createRuntime = (model: unknown, llmParams: Record<string, unknown> = {}) =>
  ({
    llmParams: {
      modelId: (model as any)?.id ?? MODEL_ID,
      ...llmParams
    }
  }) as any;

describe('mergePiAgentPayload', () => {
  let originalLlmModelIdMap: typeof global.llmModelIdMap;

  beforeEach(() => {
    originalLlmModelIdMap = global.llmModelIdMap;
    global.llmModelIdMap = new Map([[MODEL_ID, createModel()]]) as any;
  });

  afterEach(() => {
    global.llmModelIdMap = originalLlmModelIdMap;
  });

  it('maps supported model parameters and parses json5 response schemas', () => {
    const result = mergePiAgentPayload({
      payload: {
        messages: [],
        requestOrigin: 'workflow'
      },
      runtime: createRuntime(createModel(), {
        maxTokens: 2000,
        temperature: 5,
        topP: 0.7,
        stop: '<END>|<STOP>',
        responseFormat: {
          type: 'json_schema',
          json_schema: "{name: 'tool_call', schema: {type: 'object'}}"
        }
      })
    });

    expect(result).toEqual({
      messages: [],
      requestOrigin: 'workflow',
      max_tokens: 2000,
      temperature: 1,
      top_p: 0.7,
      stop: ['<END>', '<STOP>'],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'tool_call',
          schema: { type: 'object' }
        }
      }
    });
  });

  it('omits unsupported optional parameters while preserving max token mapping', () => {
    const limitedModel = createModel({
      id: 'limited-id',
      maxResponse: 1024,
      maxTemperature: undefined,
      showTopP: false,
      showStopSign: false,
      responseFormatList: []
    });
    global.llmModelIdMap = new Map([['limited-id', limitedModel]]) as any;

    const result = mergePiAgentPayload({
      payload: { messages: [] },
      runtime: createRuntime(limitedModel, {
        maxTokens: 2048,
        temperature: 5,
        topP: 0.7,
        stop: '<END>',
        responseFormat: { type: 'json_object' }
      })
    });

    expect(result).toEqual({
      messages: [],
      max_tokens: 1024
    });
  });

  it('throws a stable error for an invalid json schema', () => {
    expect(() =>
      mergePiAgentPayload({
        payload: { messages: [] },
        runtime: createRuntime(createModel(), {
          responseFormat: {
            type: 'json_schema',
            json_schema: '{invalid'
          }
        })
      })
    ).toThrow('Json schema error');
  });

  it('returns non-object payloads unchanged', () => {
    const runtime = createRuntime(createModel());
    expect(mergePiAgentPayload({ payload: null, runtime })).toBeNull();
    expect(mergePiAgentPayload({ payload: ['payload'], runtime })).toEqual(['payload']);
  });
});
