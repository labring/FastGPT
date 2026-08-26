import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

vi.unmock('@fastgpt/service/common/response');

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  getLLMModelData: vi.fn(),
  createLLMResponse: vi.fn(),
  formatModelChars2Points: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert,
  clearCookie: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: mocks.createLLMResponse
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModelData: mocks.getLLMModelData
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({
    info: mocks.loggerInfo,
    error: mocks.loggerError
  }),
  LogCategories: {
    HTTP: {
      ERROR: 'http.error'
    }
  }
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: mocks.formatModelChars2Points
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createUsage: vi.fn()
}));

import handler from '@/pages/api/core/ai/optimizePrompt';

describe('optimizePrompt SSE error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({ teamId: 'team-1', tmbId: 'member-1' });
    mocks.getLLMModelData.mockReturnValue({
      modelId: '68ad85a7463006c963799a05',
      model: 'gpt-4o'
    });
    mocks.formatModelChars2Points.mockReturnValue({
      totalPoints: 0,
      modelName: 'gpt-4o',
      modelId: '68ad85a7463006c963799a05'
    });
  });

  it('treats a missing original prompt as an empty string', async () => {
    mocks.createLLMResponse.mockResolvedValue({
      usage: { inputTokens: 1, outputTokens: 1 }
    });
    const res = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn()
    };

    await handler(
      {
        body: {
          optimizerInput: 'Create a customer support prompt',
          modelId: '68ad85a7463006c963799a05'
        }
      } as any,
      res as any
    );

    expect(mocks.createLLMResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('<OriginalPrompt>\n\n</OriginalPrompt>')
            })
          ])
        })
      })
    );
    expect(mocks.getLLMModelData).toHaveBeenCalledWith({
      modelId: '68ad85a7463006c963799a05'
    });
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('logs a UserError once at info level and ends the SSE response once', async () => {
    mocks.createLLMResponse.mockRejectedValue(new UserError('Invalid optimizer input'));
    const chunks: string[] = [];
    const res = {
      closed: false,
      setHeader: vi.fn(),
      write: vi.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
      end: vi.fn()
    };

    await handler(
      {
        body: {
          originalPrompt: 'Original prompt',
          optimizerInput: 'Improve it',
          modelId: '68ad85a7463006c963799a05'
        }
      } as any,
      res as any
    );

    expect(mocks.loggerInfo).toHaveBeenCalledTimes(1);
    expect(mocks.loggerInfo).toHaveBeenCalledWith('Request error', {
      url: undefined,
      message: 'Invalid optimizer input'
    });
    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledTimes(2);
    expect(res.end).toHaveBeenCalledTimes(1);

    const output = chunks.join('');
    expect(output.match(/event: error/g)).toHaveLength(1);
    expect(output.match(/data:/g)).toHaveLength(1);
    expect(output).toContain('Invalid optimizer input');
    expect(output).not.toContain('errorType');
  });

  it('lets NextAPI handle request validation errors before starting SSE', async () => {
    const res = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn()
    };

    await expect(
      handler(
        {
          body: {
            originalPrompt: 'Original prompt',
            optimizerInput: 'Improve it',
            model: 'gpt-4o'
          }
        } as any,
        res as any
      )
    ).rejects.toBeInstanceOf(ApiRequestInputParseError);

    expect(mocks.authCert).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});
