import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { mergePiAgentPayload } from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/payload';

const createModel = (overrides: Record<string, unknown> = {}) =>
  ({
    type: ModelTypeEnum.llm,
    provider: 'openai',
    model: 'gpt-5',
    name: 'GPT-5',
    config: {
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 4096,
      maxTemperature: 2,
      showTopP: true,
      showStopSign: true,
      responseFormatList: ['json_schema'],
      functionCall: true,
      toolChoice: true
    },
    ...overrides
  }) as any;

const createRuntime = (model: unknown, llmParams: Record<string, unknown> = {}) =>
  ({
    llmParams: {
      model,
      ...llmParams
    }
  }) as any;

describe('mergePiAgentPayload', () => {
  it.each([true, false])(
    'preserves SDK reasoning and normalizes empty assistant fields only when supported: reasoning=%s',
    (reasoning) => {
      const payload: { messages: ChatCompletionMessageParam[] } = {
        messages: [
          { role: 'user', content: 'Inspect' },
          { role: 'assistant', content: 'Plan', reasoning_content: 'Original thought' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'call_search', type: 'function', function: { name: 'search', arguments: '{}' } }
            ]
          },
          { role: 'tool', tool_call_id: 'call_search', content: 'Found' },
          { role: 'assistant', content: 'Done', reasoning_content: '' }
        ]
      };
      const snapshot = structuredClone(payload);
      const configuredModel = createModel();
      configuredModel.config.reasoning = reasoning;
      const expectedMessages = structuredClone(payload.messages);
      if (reasoning) expectedMessages[2] = { ...expectedMessages[2], reasoning_content: '' };
      expect(mergePiAgentPayload({ payload, runtime: createRuntime(configuredModel) })).toEqual({
        messages: expectedMessages
      });
      expect(payload).toEqual(snapshot);
    }
  );

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
    const result = mergePiAgentPayload({
      payload: { messages: [] },
      runtime: createRuntime(
        createModel({
          config: {
            maxResponse: 1024,
            maxTemperature: undefined,
            showTopP: false,
            showStopSign: false,
            responseFormatList: []
          }
        }),
        {
          maxTokens: 2048,
          temperature: 5,
          topP: 0.7,
          stop: '<END>',
          responseFormat: { type: 'json_object' }
        }
      )
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
