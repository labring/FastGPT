import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { MongoEvaluation, MongoEvalItem } from '@fastgpt/service/core/evaluation/task/schema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { EvaluatorSchema, EvalTarget } from '@fastgpt/global/core/evaluation/type';

import {
  getEvaluationTaskStatus,
  getEvaluationTaskStats
} from '@fastgpt/service/core/evaluation/task/statusCalculator';

describe('StatusCalculator', () => {
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
        appId: '507f1f77bcf86cd799439011',
        versionId: '507f1f77bcf86cd799439012',
        chatConfig: {}
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
      name: 'StatusCalculator Test Dataset',
      description: 'Dataset for statusCalculator testing'
    });
    evalDatasetCollectionId = dataset._id.toString();

    const metric = await MongoEvalMetric.create({
      teamId: teamId,
      tmbId: tmbId,
      name: 'StatusCalculator Test Metric',
      description: 'Metric for statusCalculator testing',
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
      name: 'StatusCalculator Test Evaluation',
      description: 'Test evaluation for statusCalculator',
      evalDatasetCollectionId: new Types.ObjectId(evalDatasetCollectionId),
      target,
      evaluators: evaluators,
      usageId: new Types.ObjectId(),
      status: EvaluationStatusEnum.queuing,
      createTime: new Date()
    });
    evaluationId = evaluation._id.toString();
  });

  describe('getEvaluationTaskStatus', () => {
    test('应该返回queuing状态（无评估项时）', async () => {
      const status = await getEvaluationTaskStatus(evaluationId);
      expect(status).toBe(EvaluationStatusEnum.queuing);
    });

    test('应该返回evaluating状态（有evaluating状态的评估项时）', async () => {
      // 创建一个evaluating状态的评估项
      await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
        status: EvaluationStatusEnum.evaluating
      });

      const status = await getEvaluationTaskStatus(evaluationId);
      expect(status).toBe(EvaluationStatusEnum.evaluating);
    });

    test('应该返回evaluating状态（有queuing状态的评估项时）', async () => {
      // 创建一个queuing状态的评估项
      await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
        status: EvaluationStatusEnum.queuing
      });

      const status = await getEvaluationTaskStatus(evaluationId);
      expect(status).toBe(EvaluationStatusEnum.evaluating);
    });

    test('应该返回evaluating状态（混合evaluating和queuing状态时）', async () => {
      // 创建混合状态的评估项
      await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          status: EvaluationStatusEnum.evaluating
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q3', expectedOutput: 'A3' },
          status: EvaluationStatusEnum.completed
        }
      ]);

      const status = await getEvaluationTaskStatus(evaluationId);
      expect(status).toBe(EvaluationStatusEnum.evaluating);
    });

    test('应该返回error状态（有error状态的评估项且无运行态项时）', async () => {
      // 创建error状态的评估项
      await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          status: EvaluationStatusEnum.error
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          status: EvaluationStatusEnum.completed
        }
      ]);

      const status = await getEvaluationTaskStatus(evaluationId);
      expect(status).toBe(EvaluationStatusEnum.error);
    });

    test('应该返回evaluating状态（有error状态但也有运行态项时）', async () => {
      // 创建混合状态的评估项，包含error但有运行态项
      await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          status: EvaluationStatusEnum.error
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          status: EvaluationStatusEnum.evaluating
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q3', expectedOutput: 'A3' },
          status: EvaluationStatusEnum.completed
        }
      ]);

      const status = await getEvaluationTaskStatus(evaluationId);
      expect(status).toBe(EvaluationStatusEnum.evaluating);
    });

    test('应该返回completed状态（所有评估项都完成时）', async () => {
      // 创建所有completed状态的评估项
      await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          status: EvaluationStatusEnum.completed
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          status: EvaluationStatusEnum.completed
        }
      ]);

      const status = await getEvaluationTaskStatus(evaluationId);
      expect(status).toBe(EvaluationStatusEnum.completed);
    });

    test('数据库记录不存在时应该返回queuing状态', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const status = await getEvaluationTaskStatus(nonExistentId);
      expect(status).toBe(EvaluationStatusEnum.queuing);
    });
  });

  describe('getEvaluationTaskStats', () => {
    test('应该返回正确的统计信息', async () => {
      // 创建不同状态的评估项
      await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          status: EvaluationStatusEnum.completed
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          status: EvaluationStatusEnum.completed
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q3', expectedOutput: 'A3' },
          status: EvaluationStatusEnum.evaluating
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q4', expectedOutput: 'A4' },
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q5', expectedOutput: 'A5' },
          status: EvaluationStatusEnum.error
        }
      ]);

      const stats = await getEvaluationTaskStats(evaluationId);

      expect(stats.total).toBe(5);
      expect(stats.completed).toBe(2);
      expect(stats.evaluating).toBe(1);
      expect(stats.queuing).toBe(1);
      expect(stats.error).toBe(1);
    });

    test('应该正确处理空评估任务', async () => {
      const stats = await getEvaluationTaskStats(evaluationId);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.evaluating).toBe(0);
      expect(stats.queuing).toBe(0);
      expect(stats.error).toBe(0);
    });

    test('应该正确处理只有一种状态的情况', async () => {
      // 创建只有completed状态的评估项
      await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          status: EvaluationStatusEnum.completed
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          status: EvaluationStatusEnum.completed
        }
      ]);

      const stats = await getEvaluationTaskStats(evaluationId);

      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(2);
      expect(stats.evaluating).toBe(0);
      expect(stats.queuing).toBe(0);
      expect(stats.error).toBe(0);
    });
  });

  describe('错误处理', () => {
    test('getEvaluationTaskStats查询错误应该返回默认统计', async () => {
      // Mock MongoEvalItem.find to throw error
      const originalFind = MongoEvalItem.find;
      MongoEvalItem.find = vi.fn().mockRejectedValue(new Error('Database error'));

      const stats = await getEvaluationTaskStats(evaluationId);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.evaluating).toBe(0);
      expect(stats.queuing).toBe(0);
      expect(stats.error).toBe(0);

      // Restore original function
      MongoEvalItem.find = originalFind;
    });

    test('getEvaluationTaskStatus查询错误应该正确处理异常情况', async () => {
      // Mock MongoEvalItem.find to throw error
      const originalFind = MongoEvalItem.find;
      MongoEvalItem.find = vi.fn().mockRejectedValue(new Error('Database error'));

      const status = await getEvaluationTaskStatus(evaluationId);

      // When getEvaluationTaskStats catches the error, it returns default stats with total=0
      // getEvaluationTaskStatus then returns 'queuing' for total=0 case
      expect(status).toBe(EvaluationStatusEnum.queuing);

      // Restore original function
      MongoEvalItem.find = originalFind;
    });
  });
});
