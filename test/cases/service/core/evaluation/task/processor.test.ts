import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  MetricResultStatusEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/evaluation/metric/constants';
import { MongoEvaluation, MongoEvalItem } from '@fastgpt/service/core/evaluation/task/schema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type {
  EvaluatorSchema,
  EvalTarget,
  TargetOutput
} from '@fastgpt/global/core/evaluation/type';
import type { MetricResult } from '@fastgpt/global/core/evaluation/metric/type';

// Mock all external dependencies
vi.mock('@fastgpt/service/common/system/log');
vi.mock('@fastgpt/service/core/evaluation/task/mq');
vi.mock('@fastgpt/service/core/evaluation/target');
vi.mock('@fastgpt/service/core/evaluation/evaluator');
vi.mock('@fastgpt/service/support/permission/teamLimit');
vi.mock('@fastgpt/service/core/evaluation/utils/usage');
vi.mock('@fastgpt/service/core/evaluation/summary');
vi.mock('@fastgpt/service/core/evaluation/summary/util/aggregateScoreCalculator');
vi.mock('@fastgpt/service/core/evaluation/task/statusCalculator');
vi.mock('@fastgpt/service/core/evaluation/task/errors');

import {
  finishEvaluationTask,
  evaluationTaskProcessor,
  evaluationItemProcessor
} from '@fastgpt/service/core/evaluation/task/processor';

describe('EvaluationTaskProcessor', () => {
  let teamId: string;
  let tmbId: string;
  let evalDatasetCollectionId: string;
  let target: EvalTarget;
  let evaluators: EvaluatorSchema[];
  let evaluationId: string;

  beforeAll(async () => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';

    target = {
      type: 'workflow',
      config: {
        appId: '507f1f77bcf86cd799439013',
        versionId: '507f1f77bcf86cd799439014',
        chatConfig: {
          temperature: 0.7,
          maxToken: 2000
        }
      }
    };
  });

  afterAll(async () => {
    // 清理测试数据
    await Promise.all([
      MongoEvaluation.deleteMany({ teamId }),
      MongoEvalItem.deleteMany({}),
      MongoEvalDatasetCollection.deleteMany({ teamId }),
      MongoEvalDatasetData.deleteMany({ teamId }),
      MongoEvalMetric.deleteMany({ teamId })
    ]);
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // 创建测试数据
    const dataset = await MongoEvalDatasetCollection.create({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId),
      name: 'Processor Test Dataset',
      description: 'Dataset for processor testing'
    });
    evalDatasetCollectionId = dataset._id.toString();

    // 创建数据集数据项
    await MongoEvalDatasetData.create([
      {
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        evalDatasetCollectionId: dataset._id,
        userInput: 'What is AI?',
        expectedOutput: 'Artificial Intelligence'
      },
      {
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        evalDatasetCollectionId: dataset._id,
        userInput: 'What is ML?',
        expectedOutput: 'Machine Learning'
      }
    ]);

    const metric = await MongoEvalMetric.create({
      teamId: teamId,
      tmbId: tmbId,
      name: 'Processor Test Metric',
      description: 'Metric for processor testing',
      type: EvalMetricTypeEnum.Custom,
      prompt: 'Please evaluate the quality of the response.',
      llmRequired: true,
      userInputRequired: true,
      actualOutputRequired: true,
      expectedOutputRequired: true,
      createTime: new Date(),
      updateTime: new Date()
    });

    evaluators = [
      {
        metric: metric.toObject(),
        runtimeConfig: {
          llm: 'gpt-3.5-turbo'
        },
        thresholdValue: 0.8
      }
    ];

    // 创建测试评估任务
    const evaluation = await MongoEvaluation.create({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId),
      name: 'Processor Test Evaluation',
      description: 'Test evaluation for processor',
      evalDatasetCollectionId: new Types.ObjectId(evalDatasetCollectionId),
      target,
      evaluators: evaluators,
      usageId: new Types.ObjectId(),
      status: EvaluationStatusEnum.queuing,
      createTime: new Date()
    });
    evaluationId = evaluation._id.toString();

    // Setup mocks
    const { addEvaluationItemJobs } = await import('@fastgpt/service/core/evaluation/task/mq');
    const { createTargetInstance } = await import('@fastgpt/service/core/evaluation/target');
    const { createEvaluatorInstance } = await import('@fastgpt/service/core/evaluation/evaluator');
    const { checkTeamAIPoints } = await import('@fastgpt/service/support/permission/teamLimit');
    const { createMergedEvaluationUsage } = await import(
      '@fastgpt/service/core/evaluation/utils/usage'
    );
    const { calculateEvaluationItemAggregateScore } = await import(
      '@fastgpt/service/core/evaluation/summary/util/aggregateScoreCalculator'
    );
    const { getBatchEvaluationItemStatus } = await import(
      '@fastgpt/service/core/evaluation/task/statusCalculator'
    );
    const { createEvaluationError } = await import('@fastgpt/service/core/evaluation/task/errors');

    (addEvaluationItemJobs as any).mockResolvedValue(undefined);
    (checkTeamAIPoints as any).mockResolvedValue(undefined);
    (createMergedEvaluationUsage as any).mockResolvedValue(undefined);
    (calculateEvaluationItemAggregateScore as any).mockResolvedValue(85);
    (getBatchEvaluationItemStatus as any).mockResolvedValue(new Map());
    (createEvaluationError as any).mockImplementation((error: any) => new Error(error));

    // Mock target instance
    const mockTargetOutput: TargetOutput = {
      actualOutput: 'AI is artificial intelligence technology',
      responseTime: 1500,
      chatId: 'test-chat-id',
      aiChatItemDataId: 'test-ai-chat-item-id',
      usage: [
        {
          totalPoints: 10,
          inputTokens: 50,
          outputTokens: 30
        }
      ]
    };

    (createTargetInstance as any).mockResolvedValue({
      execute: vi.fn().mockResolvedValue(mockTargetOutput)
    });

    // Mock evaluator instance
    const mockEvaluatorOutput: MetricResult = {
      metricName: 'Processor Test Metric',
      status: MetricResultStatusEnum.Success,
      data: {
        score: 85,
        reason: 'Good quality response',
        metricName: 'Processor Test Metric'
      },
      totalPoints: 5,
      usages: [
        {
          promptTokens: 20,
          completionTokens: 15,
          modelType: ModelTypeEnum.LLM
        }
      ]
    };

    (createEvaluatorInstance as any).mockResolvedValue({
      evaluate: vi.fn().mockResolvedValue(mockEvaluatorOutput)
    });

    // Mock summary service methods
    const { EvaluationSummaryService } = await import('@fastgpt/service/core/evaluation/summary');
    vi.mocked(EvaluationSummaryService.calculateAndSaveMetricScores).mockResolvedValue(undefined);
    vi.mocked(EvaluationSummaryService.generateSummaryReports).mockResolvedValue(undefined);
  });

  describe('finishEvaluationTask', () => {
    test('应该正确完成评估任务（所有项目完成）', async () => {
      // 创建已完成的评估项目
      await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          finishTime: new Date()
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          finishTime: new Date()
        }
      ]);

      const { getBatchEvaluationItemStatus } = await import(
        '@fastgpt/service/core/evaluation/task/statusCalculator'
      );
      (getBatchEvaluationItemStatus as any).mockResolvedValue(
        new Map([
          ['item1', EvaluationStatusEnum.completed],
          ['item2', EvaluationStatusEnum.completed]
        ])
      );

      await finishEvaluationTask(evaluationId);

      // 验证任务状态更新
      const updatedEvaluation = await MongoEvaluation.findById(evaluationId);
      expect(updatedEvaluation?.finishTime).toBeDefined();
    });

    test('应该跳过仍有待处理项目的任务', async () => {
      // 创建混合状态的评估项目
      const allItems = await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          finishTime: new Date()
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' }
        }
      ]);

      const itemIds = allItems.map((item) => item._id.toString());
      const { getBatchEvaluationItemStatus } = await import(
        '@fastgpt/service/core/evaluation/task/statusCalculator'
      );
      (getBatchEvaluationItemStatus as any).mockResolvedValue(
        new Map([
          [itemIds[0], EvaluationStatusEnum.completed],
          [itemIds[1], EvaluationStatusEnum.evaluating]
        ])
      );

      await finishEvaluationTask(evaluationId);

      // 验证任务状态未更新
      const evaluation = await MongoEvaluation.findById(evaluationId);
      expect(evaluation?.finishTime).toBeUndefined();
    });

    test('应该触发摘要生成', async () => {
      // 创建已完成的评估项目
      await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          finishTime: new Date()
        }
      ]);

      const { getBatchEvaluationItemStatus } = await import(
        '@fastgpt/service/core/evaluation/task/statusCalculator'
      );
      (getBatchEvaluationItemStatus as any).mockResolvedValue(
        new Map([['item1', EvaluationStatusEnum.completed]])
      );

      const { EvaluationSummaryService } = await import('@fastgpt/service/core/evaluation/summary');

      await finishEvaluationTask(evaluationId);

      expect(EvaluationSummaryService.calculateAndSaveMetricScores).toHaveBeenCalledWith(
        evaluationId
      );
    });

    test('应该正确处理空评估任务', async () => {
      const emptyEvaluation = await MongoEvaluation.create({
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Empty Evaluation',
        description: 'Empty evaluation for testing',
        evalDatasetCollectionId: new Types.ObjectId(evalDatasetCollectionId),
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.queuing,
        createTime: new Date()
      });

      const { addLog } = await import('@fastgpt/service/common/system/log');

      await finishEvaluationTask(emptyEvaluation._id.toString());

      expect(addLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('Evaluation task has no evaluation item data')
      );
    });

    test('应该正确处理错误情况', async () => {
      // Create evaluation items first to avoid empty task scenario
      await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' }
        }
      ]);

      // Setup error mock before calling the function
      const { addLog } = await import('@fastgpt/service/common/system/log');
      const { getBatchEvaluationItemStatus } = await import(
        '@fastgpt/service/core/evaluation/task/statusCalculator'
      );
      (getBatchEvaluationItemStatus as any).mockRejectedValue(new Error('Status check failed'));

      await finishEvaluationTask(evaluationId);

      // 验证错误被正确处理 - check if any call contains our expected message
      const errorCalls = (addLog.error as any).mock.calls;
      const hasExpectedError = errorCalls.some(
        (call: any[]) =>
          call[0] &&
          typeof call[0] === 'string' &&
          call[0].includes('[Evaluation] Error occurred while completing task')
      );

      expect(hasExpectedError).toBe(true);
    });
  });

  describe('evaluationTaskProcessor', () => {
    test('应该成功处理评估任务（已有评估项目）', async () => {
      // 创建现有评估项目
      const existingItems = await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' }
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' }
        }
      ]);

      const { getBatchEvaluationItemStatus } = await import(
        '@fastgpt/service/core/evaluation/task/statusCalculator'
      );
      (getBatchEvaluationItemStatus as any).mockResolvedValue(
        new Map([
          [existingItems[0]._id.toString(), EvaluationStatusEnum.queuing],
          [existingItems[1]._id.toString(), EvaluationStatusEnum.queuing]
        ])
      );

      const mockJob = {
        data: { evalId: evaluationId },
        updateProgress: vi.fn()
      };

      await evaluationTaskProcessor(mockJob as any);

      expect(mockJob.updateProgress).toHaveBeenCalledWith(0);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(20);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);

      const { addEvaluationItemJobs } = await import('@fastgpt/service/core/evaluation/task/mq');
      expect(addEvaluationItemJobs).toHaveBeenCalled();
    });

    test('应该创建评估项目（无现有项目）', async () => {
      const mockJob = {
        data: { evalId: evaluationId },
        updateProgress: vi.fn()
      };

      await evaluationTaskProcessor(mockJob as any);

      // 验证评估项目被创建
      const createdItems = await MongoEvalItem.find({ evalId: evaluationId });
      expect(createdItems.length).toBe(2);

      const { addEvaluationItemJobs } = await import('@fastgpt/service/core/evaluation/task/mq');
      expect(addEvaluationItemJobs).toHaveBeenCalled();
    });

    test('应该处理评估任务不存在的情况', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const mockJob = {
        data: { evalId: nonExistentId },
        updateProgress: vi.fn()
      };

      await evaluationTaskProcessor(mockJob as any);

      expect(mockJob.updateProgress).toHaveBeenCalledWith(0);

      const { addLog } = await import('@fastgpt/service/common/system/log');
      expect(addLog.warn).toHaveBeenCalledWith(expect.stringContaining('no longer exists'));
    });

    test('应该验证目标配置', async () => {
      // 创建无效目标配置的评估任务
      const invalidEvaluationDoc = new MongoEvaluation({
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Invalid Target Evaluation',
        description: 'Evaluation with invalid target',
        evalDatasetCollectionId: new Types.ObjectId(evalDatasetCollectionId),
        target: {
          type: 'workflow'
          // 缺少 config 字段
        } as any,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.queuing,
        createTime: new Date()
      });

      // Save without validation to test the processor's validation logic
      const invalidEvaluation = await invalidEvaluationDoc.save({ validateBeforeSave: false });

      const mockJob = {
        data: { evalId: invalidEvaluation._id.toString() },
        updateProgress: vi.fn()
      };

      await expect(evaluationTaskProcessor(mockJob as any)).rejects.toThrow();
    });

    test('应该验证评估器配置', async () => {
      // 创建无效评估器配置的评估任务
      const invalidEvaluation = await MongoEvaluation.create({
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Invalid Evaluators Evaluation',
        description: 'Evaluation with invalid evaluators',
        evalDatasetCollectionId: new Types.ObjectId(evalDatasetCollectionId),
        target,
        evaluators: [], // 空评估器
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.queuing,
        createTime: new Date()
      });

      const mockJob = {
        data: { evalId: invalidEvaluation._id.toString() },
        updateProgress: vi.fn()
      };

      await expect(evaluationTaskProcessor(mockJob as any)).rejects.toThrow();
    });

    test('应该处理数据集为空的情况', async () => {
      // 创建空数据集
      const emptyDataset = await MongoEvalDatasetCollection.create({
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Empty Dataset',
        description: 'Empty dataset for testing'
      });

      const emptyEvaluation = await MongoEvaluation.create({
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Empty Dataset Evaluation',
        description: 'Evaluation with empty dataset',
        evalDatasetCollectionId: emptyDataset._id,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.queuing,
        createTime: new Date()
      });

      const mockJob = {
        data: { evalId: emptyEvaluation._id.toString() },
        updateProgress: vi.fn()
      };

      await expect(evaluationTaskProcessor(mockJob as any)).rejects.toThrow();
    });
  });

  describe('evaluationItemProcessor', () => {
    test('应该成功处理评估项目', async () => {
      // 创建评估项目
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        }
      });

      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await evaluationItemProcessor(mockJob as any);

      expect(mockJob.updateProgress).toHaveBeenCalledWith(0);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(10);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(30);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);

      // 验证项目被更新
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.targetOutput).toBeDefined();
      expect(updatedItem?.evaluatorOutputs).toBeDefined();
      expect(updatedItem?.aggregateScore).toBeDefined();
    });

    test('应该从检查点恢复', async () => {
      // 创建带有现有输出的评估项目
      const mockTargetOutput: TargetOutput = {
        actualOutput: 'Existing AI response',
        responseTime: 1000,
        chatId: 'existing-chat-id',
        aiChatItemDataId: 'existing-ai-chat-item-id'
      };

      const mockEvaluatorOutputs: MetricResult[] = [
        {
          metricName: 'Test Metric',
          status: MetricResultStatusEnum.Success,
          data: {
            score: 90,
            metricName: 'Test Metric'
          }
        }
      ];

      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        },
        targetOutput: mockTargetOutput,
        evaluatorOutputs: mockEvaluatorOutputs
      });

      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await evaluationItemProcessor(mockJob as any);

      // 验证跳过了目标执行和评估器执行
      const { createTargetInstance } = await import('@fastgpt/service/core/evaluation/target');
      expect(createTargetInstance).not.toHaveBeenCalled();
    });

    test('应该处理评估项目不存在的情况', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: nonExistentId
        },
        updateProgress: vi.fn()
      };

      await expect(evaluationItemProcessor(mockJob as any)).rejects.toThrow();
    });

    test('应该处理评估任务不存在的情况', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        }
      });

      const mockJob = {
        data: {
          evalId: new Types.ObjectId().toString(),
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await expect(evaluationItemProcessor(mockJob as any)).rejects.toThrow();
    });

    test('应该检查AI点数', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        }
      });

      const { checkTeamAIPoints } = await import('@fastgpt/service/support/permission/teamLimit');
      (checkTeamAIPoints as any).mockRejectedValue(new Error('Insufficient AI points'));

      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await expect(evaluationItemProcessor(mockJob as any)).rejects.toThrow();
    });

    test('应该处理目标执行错误', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        }
      });

      const { createTargetInstance } = await import('@fastgpt/service/core/evaluation/target');
      (createTargetInstance as any).mockResolvedValue({
        execute: vi.fn().mockRejectedValue(new Error('Target execution failed'))
      });

      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await expect(evaluationItemProcessor(mockJob as any)).rejects.toThrow();
    });

    test('应该处理评估器执行错误', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        }
      });

      const { createEvaluatorInstance } = await import(
        '@fastgpt/service/core/evaluation/evaluator'
      );
      (createEvaluatorInstance as any).mockResolvedValue({
        evaluate: vi.fn().mockRejectedValue(new Error('Evaluator execution failed'))
      });

      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await expect(evaluationItemProcessor(mockJob as any)).rejects.toThrow();
    });

    test('应该记录使用情况', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        }
      });

      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await evaluationItemProcessor(mockJob as any);

      const { createMergedEvaluationUsage } = await import(
        '@fastgpt/service/core/evaluation/utils/usage'
      );
      expect(createMergedEvaluationUsage).toHaveBeenCalledTimes(2); // 目标 + 评估器
    });

    test('应该处理部分评估器失败', async () => {
      // 创建有多个评估器的评估任务
      const multiEvaluators = [
        evaluators[0],
        {
          metric: evaluators[0].metric,
          runtimeConfig: { llm: 'gpt-4' },
          thresholdValue: 0.9
        }
      ];

      await MongoEvaluation.updateOne(
        { _id: evaluationId },
        { $set: { evaluators: multiEvaluators } }
      );

      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        }
      });

      // Mock 第二个评估器失败
      const { createEvaluatorInstance } = await import(
        '@fastgpt/service/core/evaluation/evaluator'
      );
      (createEvaluatorInstance as any)
        .mockResolvedValueOnce({
          evaluate: vi.fn().mockResolvedValue({
            metricName: 'Test Metric 1',
            status: MetricResultStatusEnum.Success,
            data: { score: 85 }
          })
        })
        .mockResolvedValueOnce({
          evaluate: vi.fn().mockRejectedValue(new Error('Second evaluator failed'))
        });

      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await expect(evaluationItemProcessor(mockJob as any)).rejects.toThrow('Evaluator errors');
    });
  });

  describe('错误处理和边界情况', () => {
    test('应该正确处理无效的targetOutput', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        }
      });

      const { createTargetInstance } = await import('@fastgpt/service/core/evaluation/target');
      (createTargetInstance as any).mockResolvedValue({
        execute: vi.fn().mockResolvedValue({
          responseTime: 1000,
          usage: []
          // 缺少 actualOutput
        })
      });

      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await expect(evaluationItemProcessor(mockJob as any)).rejects.toThrow();
    });

    test('应该正确处理评估器状态错误', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: {
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        }
      });

      const { createEvaluatorInstance } = await import(
        '@fastgpt/service/core/evaluation/evaluator'
      );
      (createEvaluatorInstance as any).mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          metricName: 'Test Metric',
          status: MetricResultStatusEnum.Failed,
          error: 'Evaluation failed',
          data: {
            score: undefined,
            metricName: 'Test Metric'
          }
        })
      });

      const mockJob = {
        data: {
          evalId: evaluationId,
          evalItemId: evalItem._id.toString()
        },
        updateProgress: vi.fn()
      };

      await expect(evaluationItemProcessor(mockJob as any)).rejects.toThrow('Evaluator errors');
    });
  });
});
