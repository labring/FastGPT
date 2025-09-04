import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/evaluation/metric/debug';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { createDitingClient } from '@fastgpt/service/core/evaluation/evaluator/ditingClient';
import type { DebugMetricBody } from '@fastgpt/global/core/evaluation/metric/api';

// Mock dependencies
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: vi.fn()
}));

vi.mock('@fastgpt/service/core/evaluation/evaluator/ditingClient', () => ({
  createDitingClient: vi.fn()
}));

describe('/api/core/evaluation/metric/debug', () => {
  const mockTeamId = '507f1f77bcf86cd799439011';
  const mockTmbId = '507f1f77bcf86cd799439012';
  const mockUserId = '507f1f77bcf86cd799439013';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should debug metric successfully', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock Diting client
    const mockDitingClient = {
      runEvaluation: vi.fn().mockResolvedValue({
        data: {
          score: 0.85,
          reason: 'Good response quality'
        },
        usages: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150
        }
      })
    };
    vi.mocked(createDitingClient).mockReturnValue(mockDitingClient as any);

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'test-key'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    const result = await handler(req as any, {} as any);

    // Verify auth was called correctly
    expect(authUserPer).toHaveBeenCalledWith({
      req,
      authToken: true,
      authApiKey: true,
      per: expect.any(Number)
    });

    // Verify Diting client was created and called
    expect(createDitingClient).toHaveBeenCalled();
    expect(mockDitingClient.runEvaluation).toHaveBeenCalledWith({
      evalCase: {
        userInput: 'What is the capital of France?',
        actualOutput: 'The capital of France is Paris.',
        expectedOutput: 'Paris is the capital of France.'
      },
      llmConfig: {
        name: 'gpt-3.5-turbo',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key'
      },
      metricConfig: {
        prompt: 'Evaluate the quality of the response'
      }
    });

    // Verify response
    expect(result).toEqual({
      score: 0.85,
      reason: 'Good response quality',
      usages: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      }
    });
  });

  it('should reject when userInput is missing', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('UserInput is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should reject when userInput is empty', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          userInput: '',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('UserInput is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should reject when actualOutput is missing', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('ActualOutput is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should reject when actualOutput is empty', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: '',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('ActualOutput is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should reject when expectedOutput is missing', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('ExpectedOutput is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should reject when expectedOutput is empty', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: ''
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('ExpectedOutput is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should reject when metricConfig prompt is missing', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {}
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Prompt is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should reject when metricConfig prompt is empty', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: ''
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Prompt is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should reject when LLM model name is missing', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {},
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('LLM model name is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should reject when LLM model name is empty', async () => {
    // Mock auth response first since it's called before validation
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: ''
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('LLM model name is required');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should handle auth failure', async () => {
    const authError = new Error('Authentication failed');
    vi.mocked(authUserPer).mockRejectedValue(authError);

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toThrow('Authentication failed');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).not.toHaveBeenCalled();
  });

  it('should handle evaluation failure', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock Diting client with evaluation failure
    const mockDitingClient = {
      runEvaluation: vi.fn().mockRejectedValue(new Error('Evaluation service failed'))
    };
    vi.mocked(createDitingClient).mockReturnValue(mockDitingClient as any);

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Evaluation service failed');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).toHaveBeenCalled();
    expect(mockDitingClient.runEvaluation).toHaveBeenCalled();
  });

  it('should handle evaluation failure with custom message', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock Diting client with custom error message
    const mockDitingClient = {
      runEvaluation: vi.fn().mockRejectedValue({ message: 'Custom evaluation error' })
    };
    vi.mocked(createDitingClient).mockReturnValue(mockDitingClient as any);

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Custom evaluation error');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).toHaveBeenCalled();
    expect(mockDitingClient.runEvaluation).toHaveBeenCalled();
  });

  it('should handle evaluation failure without message', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock Diting client with generic error
    const mockDitingClient = {
      runEvaluation: vi.fn().mockRejectedValue({})
    };
    vi.mocked(createDitingClient).mockReturnValue(mockDitingClient as any);

    const req = {
      body: {
        evalCase: {
          userInput: 'What is the capital of France?',
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Evaluation failed');

    expect(authUserPer).toHaveBeenCalled();
    expect(createDitingClient).toHaveBeenCalled();
    expect(mockDitingClient.runEvaluation).toHaveBeenCalled();
  });
});
