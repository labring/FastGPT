import { vi } from 'vitest';
import type { UnStreamResponseType } from '@fastgpt/global/core/ai/llm/type';

/**
 * Mock LLM response utilities for testing
 */

/**
 * Create a mock non-streaming response with reason and text
 * This simulates a complete response from models that support reasoning (like o1)
 */
export const createMockCompleteResponseWithReason = (options?: {
  content?: string;
  reasoningContent?: string;
  finishReason?: 'stop' | 'length' | 'content_filter';
  promptTokens?: number;
  completionTokens?: number;
}): UnStreamResponseType => {
  const {
    content = 'This is the answer to your question.',
    reasoningContent = 'First, I need to analyze the question...',
    finishReason = 'stop',
    promptTokens = 100,
    completionTokens = 50
  } = options || {};

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          reasoning_content: reasoningContent,
          refusal: null
        } as any,
        logprobs: null,
        finish_reason: finishReason
      }
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    },
    system_fingerprint: 'fp_test'
  } as UnStreamResponseType;
};

/**
 * Create a mock non-streaming response with tool calls
 * This simulates a response where the model decides to call tools/functions
 */
export const createMockCompleteResponseWithTool = (options?: {
  toolCalls?: Array<{
    id?: string;
    name: string;
    arguments: string | Record<string, any>;
  }>;
  finishReason?: 'tool_calls' | 'stop';
  promptTokens?: number;
  completionTokens?: number;
}): UnStreamResponseType => {
  const {
    toolCalls = [
      {
        id: 'call_test_001',
        name: 'get_weather',
        arguments: { location: 'Beijing', unit: 'celsius' }
      }
    ],
    finishReason = 'tool_calls',
    promptTokens = 120,
    completionTokens = 30
  } = options || {};

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          refusal: null,
          tool_calls: toolCalls.map((call, index) => ({
            id: call.id || `call_${Date.now()}_${index}`,
            type: 'function' as const,
            function: {
              name: call.name,
              arguments:
                typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments)
            }
          }))
        },
        logprobs: null,
        finish_reason: finishReason
      }
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    },
    system_fingerprint: 'fp_test'
  } as UnStreamResponseType;
};

/**
 * Mock implementation for createChatCompletion
 * Can be configured to return different types of responses based on test needs
 */
export const mockCreateChatCompletion = vi.fn(
  async (body: any, options?: any): Promise<UnStreamResponseType> => {
    // Default: return response with text
    if (body.tools && body.tools.length > 0) {
      return createMockCompleteResponseWithTool();
    }
    return createMockCompleteResponseWithReason();
  }
);

/**
 * Setup global mock for LLM request module
 */
vi.mock('@fastgpt/service/core/ai/llm/request', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createChatCompletion: mockCreateChatCompletion
  };
});
