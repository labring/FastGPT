import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamSimpleOpenAICompletions } from '@mariozechner/pi-ai/openai-completions';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  buildPiModel,
  getPiThinkingLevel
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/modelBridge';
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
    'restores omitted SDK reasoning fields only for reasoning models: %s',
    (reasoning) => {
      const model = createModel();
      model.config.reasoning = reasoning;
      const payload = {
        messages: [
          { role: 'user', content: 'Continue.' },
          { role: 'assistant', content: 'Earlier answer.' },
          { role: 'assistant', content: 'Answer.', reasoning_content: '' },
          { role: 'assistant', content: 'Answer.', reasoning_content: 'Original reasoning.' }
        ]
      };
      const original = structuredClone(payload);
      const result = mergePiAgentPayload({ payload, runtime: createRuntime(model) });
      expect(result).toEqual({
        messages: [
          payload.messages[0],
          { ...payload.messages[1], ...(reasoning ? { reasoning_content: '' } : {}) },
          payload.messages[2],
          payload.messages[3]
        ]
      });
      expect(payload).toEqual(original);
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

  describe('Pi SDK outbound request body regression', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const captureWireRequestBody = async ({
      model,
      reasoningEffort,
      baseUrl = 'https://proxy.example.com/v1'
    }: {
      model: Record<string, any>;
      reasoningEffort?: any;
      baseUrl?: string;
    }) => {
      let capturedBody: Record<string, unknown> | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_input, init) => {
        capturedBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        });
      });

      const piModel = buildPiModel(model as any, false, {
        key: 'test-key',
        baseUrl
      } as any);
      const thinkingLevel = getPiThinkingLevel(model as any, reasoningEffort);
      const runtime = createRuntime(model, { reasoningEffort });

      const stream = streamSimpleOpenAICompletions(
        piModel,
        {
          systemPrompt: 'You are helpful.',
          messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }]
        },
        {
          apiKey: 'test-key',
          reasoning: thinkingLevel === 'off' ? undefined : thinkingLevel,
          onPayload: (payload) => mergePiAgentPayload({ payload, runtime })
        }
      );
      await stream.result();
      return capturedBody;
    };

    it.each([
      {
        name: 'preserves xhigh for gpt-5.5 instead of letting pi-ai clamp to high',
        model: createModel({
          model: 'gpt-5.5',
          config: {
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            reasoning: true,
            reasoningEffort: true,
            reasoningEffortList: ['none', 'low', 'medium', 'high', 'xhigh']
          }
        }),
        reasoningEffort: 'xhigh',
        expectedEffort: 'xhigh'
      },
      {
        name: 'omits reasoning_effort when caller leaves reasoningEffort unset (default)',
        model: createModel({
          model: 'xhigh-only-model',
          config: {
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            reasoning: true,
            reasoningEffort: true,
            reasoningEffortList: ['xhigh']
          }
        }),
        reasoningEffort: undefined,
        expectedEffort: undefined
      },
      {
        name: 'explicitly sends reasoning_effort=none when supported (e.g. deepseek-flash)',
        model: createModel({
          model: 'deepseek-flash',
          config: {
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            reasoning: true,
            reasoningEffort: true,
            reasoningEffortList: ['none', 'high']
          }
        }),
        reasoningEffort: 'none',
        expectedEffort: 'none'
      },
      {
        name: 'omits reasoning_effort when configured level is unsupported (e.g. legacy none on o4-mini)',
        model: createModel({
          model: 'o4-mini',
          config: {
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            reasoning: true,
            reasoningEffort: true,
            reasoningEffortList: ['low', 'high']
          }
        }),
        reasoningEffort: 'none',
        expectedEffort: undefined
      },
      {
        name: 'omits reasoning_effort when model disables reasoningEffort',
        model: createModel({
          model: 'reasoning-fixed',
          config: {
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            reasoning: true,
            reasoningEffort: false
          }
        }),
        reasoningEffort: 'high',
        expectedEffort: undefined
      }
    ])('$name', async ({ model, reasoningEffort, expectedEffort }) => {
      const wireBody = await captureWireRequestBody({ model, reasoningEffort });
      expect(wireBody).toBeDefined();
      if (expectedEffort === undefined) {
        expect(wireBody).not.toHaveProperty('reasoning_effort');
      } else {
        expect(wireBody).toHaveProperty('reasoning_effort', expectedEffort);
      }
    });

    it('writes only reasoning.effort for OpenRouter and enable_thinking for Z.ai without conflicting reasoning_effort', async () => {
      const openRouterXhigh = await captureWireRequestBody({
        baseUrl: 'https://openrouter.ai/api/v1',
        model: createModel({
          model: 'openai/gpt-5.5',
          config: {
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            reasoning: true,
            reasoningEffort: true,
            reasoningEffortList: ['none', 'low', 'medium', 'high', 'xhigh']
          }
        }),
        reasoningEffort: 'xhigh'
      });
      expect(openRouterXhigh).toHaveProperty('reasoning', { effort: 'xhigh' });
      expect(openRouterXhigh).not.toHaveProperty('reasoning_effort');

      const openRouterDisabled = await captureWireRequestBody({
        baseUrl: 'https://openrouter.ai/api/v1',
        model: createModel({
          model: 'openai/fixed-reasoning',
          config: {
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            reasoning: true,
            reasoningEffort: false
          }
        }),
        reasoningEffort: 'high'
      });
      expect(openRouterDisabled).not.toHaveProperty('reasoning');
      expect(openRouterDisabled).not.toHaveProperty('reasoning_effort');

      const zaiOff = await captureWireRequestBody({
        baseUrl: 'https://api.z.ai/api/paas/v4',
        model: createModel({
          model: 'glm-5',
          config: {
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            reasoning: true,
            reasoningEffort: true,
            reasoningEffortList: ['none', 'high']
          }
        }),
        reasoningEffort: 'none'
      });
      expect(zaiOff).toHaveProperty('enable_thinking', false);
      expect(zaiOff).not.toHaveProperty('reasoning_effort');

      const zaiUnsupported = await captureWireRequestBody({
        baseUrl: 'https://api.z.ai/api/paas/v4',
        model: createModel({
          model: 'glm-5.3',
          config: {
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            reasoning: true,
            reasoningEffort: true,
            reasoningEffortList: ['low', 'high', 'xhigh']
          }
        }),
        reasoningEffort: 'none'
      });
      expect(zaiUnsupported).not.toHaveProperty('enable_thinking');
      expect(zaiUnsupported).not.toHaveProperty('reasoning_effort');
    });
  });
});
