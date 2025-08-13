import { describe, expect, it, vi } from 'vitest';
import { NextApiResponse } from 'next';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

// Move mocks before imports to avoid hoisting issues
const mockResponseWrite = vi.fn();
const mockAuthCert = vi.fn().mockResolvedValue({ teamId: 'team1', tmbId: 'tmb1' });
const mockLoadRequestMessages = vi.fn().mockResolvedValue([]);
const mockCreateChatCompletion = vi.fn().mockResolvedValue({
  response: {
    [Symbol.asyncIterator]() {
      let count = 0;
      return {
        next() {
          count++;
          if (count === 1) {
            return Promise.resolve({
              value: {
                choices: [{ delta: { content: 'optimized' } }]
              },
              done: false
            });
          }
          return Promise.resolve({
            value: {
              choices: [{ finish_reason: 'stop' }]
            },
            done: false
          });
        }
      };
    }
  },
  isStreamResponse: true
});

vi.mock('@fastgpt/service/common/response', () => ({
  responseWrite: mockResponseWrite,
  sseErrRes: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mockAuthCert
}));

vi.mock('@fastgpt/service/core/chat/utils', () => ({
  loadRequestMessages: mockLoadRequestMessages
}));

vi.mock('@fastgpt/service/core/ai/config', () => ({
  createChatCompletion: mockCreateChatCompletion
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn().mockResolvedValue(100)
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: vi.fn().mockReturnValue({
    totalPoints: 10,
    modelName: 'gpt-3.5'
  })
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createUsage: vi.fn().mockResolvedValue(undefined)
}));

describe('optimizePrompt', () => {
  it('should return system prompt', async () => {
    const { getPromptOptimizerSystemPrompt } = await import('@/pages/api/core/ai/optimizePrompt');
    const systemPrompt = getPromptOptimizerSystemPrompt();
    expect(systemPrompt).toContain('Role: Prompt工程师');
    expect(systemPrompt).toContain('Skills:');
    expect(systemPrompt).toContain('Goals:');
    expect(systemPrompt).toContain('Constrains:');
    expect(systemPrompt).toContain('Suggestions:');
  });

  it('should return user prompt with input', async () => {
    const { getPromptOptimizerUserPrompt } = await import('@/pages/api/core/ai/optimizePrompt');
    const userPrompt = getPromptOptimizerUserPrompt('original prompt', 'optimizer input');
    expect(userPrompt).toContain('original prompt');
    expect(userPrompt).toContain('optimizer input');
    expect(userPrompt).toContain('注意事项');
  });

  it('should handle stream response', async () => {
    const req = {
      body: {
        originalPrompt: 'test prompt',
        optimizerInput: 'test input',
        model: 'gpt-3.5'
      }
    } as ApiRequestProps<any>;

    const res = {
      setHeader: vi.fn(),
      end: vi.fn(),
      write: vi.fn()
    } as unknown as NextApiResponse;

    const { handler } = await import('@/pages/api/core/ai/optimizePrompt');
    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream;charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');

    expect(mockResponseWrite).toHaveBeenCalledWith({
      res,
      event: SseResponseEventEnum.fastAnswer,
      data: JSON.stringify({
        choices: [{ delta: { content: 'optimized' } }]
      })
    });

    expect(mockResponseWrite).toHaveBeenCalledWith({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    expect(res.end).toHaveBeenCalled();
  });

  it('should handle errors', async () => {
    const req = {
      body: {
        originalPrompt: 'test prompt',
        optimizerInput: 'test input',
        model: 'gpt-3.5'
      }
    } as ApiRequestProps<any>;

    const res = {
      setHeader: vi.fn(),
      end: vi.fn(),
      write: vi.fn()
    } as unknown as NextApiResponse;

    mockResponseWrite.mockImplementationOnce(() => {
      throw new Error('Test error');
    });

    const { handler } = await import('@/pages/api/core/ai/optimizePrompt');
    await handler(req, res);

    expect(res.end).toHaveBeenCalled();
  });
});
