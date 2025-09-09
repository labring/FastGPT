import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/evaluation/metric/debug';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { DitingEvaluator } from '@fastgpt/service/core/evaluation/evaluator';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { createEvaluationMetricDebugUsage } from '@fastgpt/service/support/wallet/usage/controller';
import type { DebugMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

// Mock dependencies
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: vi.fn()
}));

vi.mock('@fastgpt/service/core/evaluation/evaluator', () => ({
  DitingEvaluator: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: vi.fn()
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createEvaluationMetricDebugUsage: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
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

    // Mock AI points check
    vi.mocked(checkTeamAIPoints).mockResolvedValue({
      totalPoints: 1000,
      usedPoints: 100
    });

    // Mock DitingEvaluator
    const mockEvaluate = vi.fn().mockResolvedValue({
      metricName: 'Test Metric',
      status: 'success',
      data: {
        score: 0.85,
        reason: 'Good response quality'
      },
      usages: [
        {
          model_type: 'llm',
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      ],
      totalPoints: 10
    });

    vi.mocked(DitingEvaluator).mockImplementation(
      () =>
        ({
          evaluate: mockEvaluate
        }) as any
    );

    // Mock createEvaluationMetricDebugUsage
    vi.mocked(createEvaluationMetricDebugUsage).mockResolvedValue();

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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
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

    // Verify AI points check was called
    expect(checkTeamAIPoints).toHaveBeenCalledWith(mockTeamId);

    // Verify DitingEvaluator was created and called
    expect(DitingEvaluator).toHaveBeenCalledWith(
      {
        metricName: 'Test Metric',
        metricType: 'custom_metric',
        prompt: 'Evaluate the quality of the response'
      },
      {
        name: 'gpt-3.5-turbo',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key'
      }
    );

    expect(mockEvaluate).toHaveBeenCalledWith({
      userInput: 'What is the capital of France?',
      actualOutput: 'The capital of France is Paris.',
      expectedOutput: 'Paris is the capital of France.'
    });

    // Verify createEvaluationMetricDebugUsage was called for billing
    expect(createEvaluationMetricDebugUsage).toHaveBeenCalledWith({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      metricName: 'Test Metric',
      totalPoints: 10,
      model: 'gpt-3.5-turbo',
      inputTokens: 0,
      outputTokens: 0
    });

    // Verify response
    expect(result).toEqual({
      score: 0.85,
      reason: 'Good response quality',
      usages: [
        {
          model_type: 'llm',
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      ],
      totalPoints: 10
    });
  });

  it('should reject when AI points are insufficient', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock AI points check to fail
    vi.mocked(checkTeamAIPoints).mockRejectedValue(TeamErrEnum.aiPointsNotEnough);

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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(TeamErrEnum.aiPointsNotEnough);

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).toHaveBeenCalledWith(mockTeamId);
    expect(DitingEvaluator).not.toHaveBeenCalled();
    expect(createEvaluationMetricDebugUsage).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalCaseUserInputRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalCaseUserInputRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalCaseActualOutputRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalCaseActualOutputRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalCaseExpectedOutputRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalCaseExpectedOutputRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
        metricConfig: {
          metricName: 'Test Metric',
          metricType: 'custom_metric'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalMetricPromptRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: ''
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalMetricPromptRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalLLmModelNameRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalLLmModelNameRequired
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toThrow('Authentication failed');

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).not.toHaveBeenCalled();
    expect(DitingEvaluator).not.toHaveBeenCalled();
  });

  it('should handle evaluator network error correctly', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock AI points check
    vi.mocked(checkTeamAIPoints).mockResolvedValue({
      totalPoints: 1000,
      usedPoints: 100
    });

    // Mock DitingEvaluator with evaluator network error
    const mockEvaluate = vi
      .fn()
      .mockRejectedValue(new Error(EvaluationErrEnum.evaluatorNetworkError));
    vi.mocked(DitingEvaluator).mockImplementation(
      () =>
        ({
          evaluate: mockEvaluate
        }) as any
    );

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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evaluatorNetworkError
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).toHaveBeenCalled();
    expect(DitingEvaluator).toHaveBeenCalled();
    expect(mockEvaluate).toHaveBeenCalled();
  });

  it('should handle evaluator timeout error correctly', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock AI points check
    vi.mocked(checkTeamAIPoints).mockResolvedValue({
      totalPoints: 1000,
      usedPoints: 100
    });

    // Mock DitingEvaluator with evaluator timeout error
    const mockEvaluate = vi
      .fn()
      .mockRejectedValue(new Error(EvaluationErrEnum.evaluatorRequestTimeout));
    vi.mocked(DitingEvaluator).mockImplementation(
      () =>
        ({
          evaluate: mockEvaluate
        }) as any
    );

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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evaluatorRequestTimeout
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).toHaveBeenCalled();
    expect(DitingEvaluator).toHaveBeenCalled();
    expect(mockEvaluate).toHaveBeenCalled();
  });

  it('should handle non-evaluator error with debug failed error code', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock AI points check
    vi.mocked(checkTeamAIPoints).mockResolvedValue({
      totalPoints: 1000,
      usedPoints: 100
    });

    // Mock DitingEvaluator with evaluation failure
    const mockEvaluate = vi.fn().mockRejectedValue(new Error('Evaluation service failed'));
    vi.mocked(DitingEvaluator).mockImplementation(
      () =>
        ({
          evaluate: mockEvaluate
        }) as any
    );

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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.debugEvaluationFailed
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).toHaveBeenCalled();
    expect(DitingEvaluator).toHaveBeenCalled();
    expect(mockEvaluate).toHaveBeenCalled();
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

    // Mock AI points check
    vi.mocked(checkTeamAIPoints).mockResolvedValue({
      totalPoints: 1000,
      usedPoints: 100
    });

    // Mock DitingEvaluator with custom error message
    const mockEvaluate = vi.fn().mockRejectedValue({ message: 'Custom evaluation error' });
    vi.mocked(DitingEvaluator).mockImplementation(
      () =>
        ({
          evaluate: mockEvaluate
        }) as any
    );

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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.debugEvaluationFailed
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).toHaveBeenCalled();
    expect(DitingEvaluator).toHaveBeenCalled();
    expect(mockEvaluate).toHaveBeenCalled();
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

    // Mock AI points check
    vi.mocked(checkTeamAIPoints).mockResolvedValue({
      totalPoints: 1000,
      usedPoints: 100
    });

    // Mock DitingEvaluator with generic error
    const mockEvaluate = vi.fn().mockRejectedValue({});
    vi.mocked(DitingEvaluator).mockImplementation(
      () =>
        ({
          evaluate: mockEvaluate
        }) as any
    );

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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.debugEvaluationFailed
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(checkTeamAIPoints).toHaveBeenCalled();
    expect(DitingEvaluator).toHaveBeenCalled();
    expect(mockEvaluate).toHaveBeenCalled();
  });

  // 新增的严格参数校验测试用例
  it('should reject when evalCase is missing', async () => {
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
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(EvaluationErrEnum.evalCaseRequired);
    expect(authUserPer).toHaveBeenCalled();
  });

  it('should reject when llmConfig is missing', async () => {
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
        metricConfig: {
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalLLmConfigRequired
    );
    expect(authUserPer).toHaveBeenCalled();
  });

  it('should reject when userInput exceeds maximum length', async () => {
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const longInput = 'a'.repeat(1001); // 超过 1000 字符限制

    const req = {
      body: {
        evalCase: {
          userInput: longInput,
          actualOutput: 'The capital of France is Paris.',
          expectedOutput: 'Paris is the capital of France.'
        },
        llmConfig: {
          name: 'gpt-3.5-turbo'
        },
        metricConfig: {
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalCaseUserInputTooLong
    );
    expect(authUserPer).toHaveBeenCalled();
  });

  it('should reject when prompt exceeds maximum length', async () => {
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const longPrompt = 'a'.repeat(4001); // 超过 4000 字符限制

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
          metricName: 'Test Metric',
          metricType: 'custom_metric',
          prompt: longPrompt
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalMetricPromptTooLong
    );
    expect(authUserPer).toHaveBeenCalled();
  });

  it('should reject when metric name exceeds maximum length', async () => {
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const longName = 'a'.repeat(101); // 超过 100 字符限制

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
          metricName: longName,
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalMetricNameTooLong
    );
    expect(authUserPer).toHaveBeenCalled();
  });

  it('should reject when metric name is missing', async () => {
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
          metricType: 'custom_metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as any
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalMetricNameRequired
    );
    expect(authUserPer).toHaveBeenCalled();
  });

  it('should reject when metric type is missing', async () => {
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
          metricName: 'Test Metric',
          prompt: 'Evaluate the quality of the response'
        }
      } as any
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalMetricTypeRequired
    );
    expect(authUserPer).toHaveBeenCalled();
  });

  it('should reject when invalid metric type is provided', async () => {
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
          metricName: 'Test Metric',
          metricType: 'invalid_type' as any,
          prompt: 'Evaluate the quality of the response'
        }
      } as DebugMetricBody
    };

    await expect(handler(req as any, {} as any)).rejects.toBe(
      EvaluationErrEnum.evalMetricTypeInvalid
    );
    expect(authUserPer).toHaveBeenCalled();
  });
});
