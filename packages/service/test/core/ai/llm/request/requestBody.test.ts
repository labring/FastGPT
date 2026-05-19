import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import { llmCompletionsBodyFormat } from '@fastgpt/service/core/ai/llm/request/requestBody';
import { getLLMModel } from '@fastgpt/service/core/ai/model';

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn()
}));

const mockGetLLMModel = vi.mocked(getLLMModel);

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
    ...overrides
  }) as any;

describe('llmCompletionsBodyFormat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should normalize request body with model config and supported parameters', async () => {
    const model = createModel({
      defaultConfig: {
        frequency_penalty: 0.2
      }
    });
    mockGetLLMModel.mockReturnValue(model);

    const { requestBody, modelData } = await llmCompletionsBodyFormat({
      model: 'gpt-4o',
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
    mockGetLLMModel.mockReturnValue(
      createModel({
        maxTemperature: undefined,
        showTopP: false,
        showStopSign: false,
        responseFormatList: [],
        reasoningEffort: false
      })
    );

    const { requestBody } = await llmCompletionsBodyFormat({
      model: 'gpt-4o',
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

  it('should apply field map after base formatting', async () => {
    mockGetLLMModel.mockReturnValue(
      createModel({
        fieldMap: {
          max_tokens: 'max_completion_tokens'
        }
      })
    );

    const { requestBody } = await llmCompletionsBodyFormat({
      model: 'gpt-4o',
      messages,
      stream: false,
      max_tokens: 300
    });

    expect(requestBody).not.toHaveProperty('max_tokens');
    expect(requestBody).toHaveProperty('max_completion_tokens', 300);
  });

  it('should throw when json schema cannot be parsed', async () => {
    mockGetLLMModel.mockReturnValue(createModel());

    await expect(
      llmCompletionsBodyFormat({
        model: 'gpt-4o',
        messages,
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: '{bad json'
        }
      })
    ).rejects.toThrow('Json schema error');
  });

  it('should return sanitized body when model is not found', async () => {
    mockGetLLMModel.mockReturnValue(undefined as any);

    const { requestBody, modelData } = await llmCompletionsBodyFormat({
      model: 'unknown',
      messages,
      stream: false,
      retainDatasetCite: false,
      useVision: true,
      requestOrigin: 'test'
    });

    expect(modelData).toBeUndefined();
    expect(requestBody).toEqual({
      model: 'unknown',
      messages,
      stream: false
    });
  });
});
