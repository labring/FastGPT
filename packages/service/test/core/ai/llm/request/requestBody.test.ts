import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import { llmCompletionsBodyFormat } from '@fastgpt/service/core/ai/llm/request/requestBody';

const messages = [
  {
    role: ChatCompletionRequestMessageRoleEnum.User as 'user',
    content: 'hi'
  }
];

const createModel = (overrides: Record<string, any> = {}) =>
  ({
    type: ModelTypeEnum.llm,
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    modelId: '68ad85a7463006c963799a05',
    isActive: true,
    scope: 'system' as const,
    isCustom: false,
    ...overrides,
    config: {
      maxContext: 128000,
      maxResponse: 1000,
      quoteMaxToken: 60000,
      maxTemperature: 2,
      showTopP: true,
      showStopSign: true,
      responseFormatList: [{ type: 'json_schema' }],
      reasoningEffort: true,
      toolChoice: true,
      functionCall: true,
      ...overrides.config
    }
  }) as any;

describe('llmCompletionsBodyFormat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should normalize request body with model config and supported parameters', async () => {
    const model = createModel({
      config: {
        defaultConfig: {
          frequency_penalty: 0.2
        }
      }
    });
    const { requestBody, modelData } = await llmCompletionsBodyFormat({
      model,
      messages,
      stream: false,
      max_tokens: 5000,
      temperature: 5,
      top_p: 0.7,
      stop: 'END| STOP ',
      response_format: {
        type: 'json_schema',
        json_schema: '{"name":"answer","schema":{"type":"object"}}'
      },
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'search',
            parameters: { type: 'object' }
          }
        }
      ],
      toolCallMode: 'toolChoice',
      tool_choice: 'auto',
      parallel_tool_calls: true,
      retainDatasetCite: false,
      useVision: true,
      requestOrigin: 'test'
    });

    expect(modelData).toBe(model);
    expect(requestBody).toMatchObject({
      model: 'gpt-4o',
      messages,
      stream: false,
      max_tokens: 1000,
      temperature: 1,
      top_p: 0.7,
      stop: ['END', ' STOP '],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'answer',
          schema: { type: 'object' }
        }
      },
      tool_choice: 'auto',
      parallel_tool_calls: true,
      frequency_penalty: 0.2
    });
    expect(requestBody).toHaveProperty('tools');
    expect(requestBody).not.toHaveProperty('toolCallMode');
    expect(requestBody).not.toHaveProperty('retainDatasetCite');
    expect(requestBody).not.toHaveProperty('useVision');
    expect(requestBody).not.toHaveProperty('requestOrigin');
  });

  it('should strip unsupported parameters and omit tools in prompt tool mode', async () => {
    const model = createModel({
      config: {
        maxTemperature: undefined,
        showTopP: false,
        showStopSign: false,
        responseFormatList: [],
        reasoningEffort: false
      }
    });

    const { requestBody } = await llmCompletionsBodyFormat({
      model,
      messages,
      stream: false,
      temperature: 5,
      top_p: 0.7,
      stop: 'END',
      response_format: {
        type: 'json_object'
      },
      reasoning_effort: 'high',
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'search',
            parameters: { type: 'object' }
          }
        }
      ],
      toolCallMode: 'prompt'
    });

    expect(requestBody).not.toHaveProperty('temperature');
    expect(requestBody).not.toHaveProperty('top_p');
    expect(requestBody).not.toHaveProperty('stop');
    expect(requestBody).not.toHaveProperty('response_format');
    expect(requestBody).not.toHaveProperty('reasoning_effort');
    expect(requestBody).not.toHaveProperty('tools');
  });

  it('should remove FastGPT private tool schema fields before sending tools to model', async () => {
    const model = createModel();

    const { requestBody } = await llmCompletionsBodyFormat({
      model,
      messages,
      stream: false,
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'search',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query',
                  toolDescription: 'Query for model',
                  'x-tool-description': 'HTTP query',
                  isToolParam: true,
                  isSecret: true
                },
                filters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: {
                        type: 'string',
                        toolDescription: 'Filter key'
                      }
                    },
                    toolDescription: 'Filter object'
                  }
                }
              }
            }
          }
        }
      ],
      toolCallMode: 'toolChoice'
    });

    expect(requestBody.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'search',
          description: 'search',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              },
              filters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: {
                      type: 'string'
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);
  });

  it('should apply field map after base formatting', async () => {
    const model = createModel({
      config: {
        fieldMap: {
          max_tokens: 'max_completion_tokens'
        }
      }
    });

    const { requestBody } = await llmCompletionsBodyFormat({
      model,
      messages,
      stream: false,
      max_tokens: 300
    });

    expect(requestBody).not.toHaveProperty('max_tokens');
    expect(requestBody).toHaveProperty('max_completion_tokens', 300);
  });

  it('maps the wire model identifier without exposing internal model configuration', async () => {
    const model = createModel({
      requestAuth: 'test-only-secret',
      config: { fieldMap: { model: 'model_name' } }
    });
    const snapshot = structuredClone(model);
    const { requestBody, modelData } = await llmCompletionsBodyFormat({
      model,
      messages,
      stream: false
    });

    expect(requestBody).toHaveProperty('model_name', 'gpt-4o');
    expect(requestBody).not.toHaveProperty('model');
    expect(JSON.stringify(requestBody)).not.toContain('test-only-secret');
    expect(modelData).toBe(model);
    expect(model).toEqual(snapshot);
  });

  it('maps normalized tokens and stop values rather than raw inputs', async () => {
    const model = createModel({
      config: { fieldMap: { max_tokens: 'limit', stop: 'stop_sequences' } }
    });
    const { requestBody } = await llmCompletionsBodyFormat({
      model,
      messages,
      stream: false,
      max_tokens: 5000,
      stop: 'END|STOP'
    });
    expect(requestBody).toMatchObject({ limit: 1000, stop_sequences: ['END', 'STOP'] });
    expect(requestBody).not.toHaveProperty('max_tokens');
    expect(requestBody).not.toHaveProperty('stop');
  });

  it('does not restore removed or absent fields through mapping', async () => {
    const model = createModel({
      config: {
        showStopSign: false,
        fieldMap: { stop: 'stop_sequences', useVision: 'vision', absent: 'model' }
      }
    });
    const { requestBody } = await llmCompletionsBodyFormat({
      model,
      messages,
      stream: false,
      stop: 'END',
      useVision: true
    });
    expect(requestBody).toHaveProperty('model', 'gpt-4o');
    expect(requestBody).not.toHaveProperty('stop_sequences');
    expect(requestBody).not.toHaveProperty('vision');
  });

  it('preserves identity mappings, zero and false values', async () => {
    const model = createModel({
      config: { fieldMap: { model: 'model', top_p: 'p', stream: 'streaming' } }
    });
    const { requestBody } = await llmCompletionsBodyFormat({
      model,
      messages,
      stream: false,
      top_p: 0
    });
    expect(requestBody).toMatchObject({ model: 'gpt-4o', p: 0, streaming: false });
  });

  it('applies swapped and chained mappings from a single snapshot', async () => {
    for (const fieldMap of [
      { model: 'stream', stream: 'model' },
      { stream: 'model', model: 'stream' }
    ]) {
      const { requestBody } = await llmCompletionsBodyFormat({
        model: createModel({ config: { fieldMap } }),
        messages,
        stream: false
      });
      expect(requestBody).toMatchObject({ stream: 'gpt-4o', model: false });
    }
    const { requestBody } = await llmCompletionsBodyFormat({
      model: createModel({ config: { fieldMap: { model: 'stream', stream: 'streaming' } } }),
      messages,
      stream: false
    });
    expect(requestBody).toMatchObject({ stream: 'gpt-4o', streaming: false });
    expect(requestBody).not.toHaveProperty('model');
  });

  it('rejects duplicate active destinations while keeping defaultConfig precedence', async () => {
    await expect(
      llmCompletionsBodyFormat({
        model: createModel({ config: { fieldMap: { model: 'target', stream: 'target' } } }),
        messages,
        stream: false
      })
    ).rejects.toThrow('Duplicate model fieldMap target: target');
    const { requestBody } = await llmCompletionsBodyFormat({
      model: createModel({
        config: { fieldMap: { model: 'target' }, defaultConfig: { target: 'override' } }
      }),
      messages,
      stream: false
    });
    expect(requestBody).toHaveProperty('target', 'override');
  });

  it('should throw when json schema cannot be parsed', async () => {
    const model = createModel();

    await expect(
      llmCompletionsBodyFormat({
        model,
        messages,
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: '{bad json'
        }
      })
    ).rejects.toThrow('Json schema error');
  });
});
