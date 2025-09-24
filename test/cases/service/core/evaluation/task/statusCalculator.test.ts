import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { MongoEvaluation, MongoEvalItem } from '@fastgpt/service/core/evaluation/task/schema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { EvaluatorSchema, EvalTarget } from '@fastgpt/global/core/evaluation/type';

// Mock queue system
vi.mock('@fastgpt/service/core/evaluation/task/mq', () => ({
  evaluationTaskQueue: {
    getJobs: vi.fn().mockResolvedValue([])
  },
  evaluationItemQueue: {
    getJobs: vi.fn().mockResolvedValue([])
  }
}));

import {
  getEvaluationTaskStatus,
  getEvaluationItemStatus,
  getEvaluationTaskStats,
  getBatchEvaluationItemStatus
} from '@fastgpt/service/core/evaluation/task/statusCalculator';
import { evaluationTaskQueue, evaluationItemQueue } from '@fastgpt/service/core/evaluation/task/mq';

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
    test('应该返回queuing状态（无任务时）', async () => {
      // Mock 无任务
      (evaluationTaskQueue.getJobs as any).mockResolvedValue([]);
      (evaluationItemQueue.getJobs as any).mockResolvedValue([]);

      const status = await getEvaluationTaskStatus(evaluationId);

      expect(status).toBe(EvaluationStatusEnum.queuing);
    });

    test('应该返回 evaluating 状态（有活跃任务时）', async () => {
      // Mock 活跃任务
      const mockJob = {
        id: `eval_task_${evaluationId}`,
        data: { evalId: evaluationId },
        getState: vi.fn().mockResolvedValue('active')
      };
      (evaluationTaskQueue.getJobs as any).mockResolvedValue([mockJob]);

      const status = await getEvaluationTaskStatus(evaluationId);

      expect(status).toBe(EvaluationStatusEnum.evaluating);
    });

    test('数据库记录不存在时应该返回 queuing 状态', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      (evaluationTaskQueue.getJobs as any).mockResolvedValue([]);
      (evaluationItemQueue.getJobs as any).mockResolvedValue([]);

      const status = await getEvaluationTaskStatus(nonExistentId);

      expect(status).toBe(EvaluationStatusEnum.queuing);
    });

    test('应该正确处理已完成的评估任务', async () => {
      // 更新评估任务状态为已完成
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evaluationId) },
        { $set: { finishTime: new Date() } }
      );

      (evaluationTaskQueue.getJobs as any).mockResolvedValue([]);
      (evaluationItemQueue.getJobs as any).mockResolvedValue([]);

      const status = await getEvaluationTaskStatus(evaluationId);

      expect(status).toBe(EvaluationStatusEnum.completed);
    });

    test('应该返回 error 状态（任务失败时）', async () => {
      // Mock 失败任务
      const mockJob = {
        id: `eval_task_${evaluationId}`,
        data: { evalId: evaluationId },
        getState: vi.fn().mockResolvedValue('failed')
      };
      (evaluationTaskQueue.getJobs as any).mockResolvedValue([mockJob]);

      const status = await getEvaluationTaskStatus(evaluationId);

      expect(status).toBe(EvaluationStatusEnum.error);
    });
  });

  describe('getEvaluationItemStatus', () => {
    test('应该返回数据库中的状态（无活跃任务时）', async () => {
      // 创建测试评估项
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Test input', expectedOutput: 'Test output' }
      });
      const itemId = evalItem._id.toString();

      (evaluationItemQueue.getJobs as any).mockResolvedValue([]);

      const status = await getEvaluationItemStatus(itemId);

      expect(status).toBe(EvaluationStatusEnum.queuing);
    });

    test('应该返回 evaluating 状态（有活跃任务时）', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Test input', expectedOutput: 'Test output' }
      });
      const itemId = evalItem._id.toString();

      // Mock 活跃任务
      const mockJob = {
        id: `eval_item_${itemId}`,
        data: { evalItemId: itemId },
        getState: vi.fn().mockResolvedValue('active')
      };
      (evaluationItemQueue.getJobs as any).mockResolvedValue([mockJob]);

      const status = await getEvaluationItemStatus(itemId);

      expect(status).toBe(EvaluationStatusEnum.evaluating);
    });

    test('数据库记录不存在时应该返回 queuing 状态', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      (evaluationItemQueue.getJobs as any).mockResolvedValue([]);

      const status = await getEvaluationItemStatus(nonExistentId);

      expect(status).toBe(EvaluationStatusEnum.queuing);
    });
  });

  describe('getEvaluationTaskStats', () => {
    test('应该返回正确的统计信息', async () => {
      // 创建不同状态的评估项
      const evalItems = await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          finishTime: new Date()
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          finishTime: new Date()
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q3', expectedOutput: 'A3' }
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q4', expectedOutput: 'A4' }
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Q5', expectedOutput: 'A5' },
          errorMessage: 'Test error',
          finishTime: new Date()
        }
      ]);

      // Mock 队列状态 - 一个项目正在执行
      const activeJobs = [
        {
          id: 'eval_item_someId',
          data: { evalId: evaluationId, evalItemId: evalItems[2]._id.toString() },
          getState: vi.fn().mockResolvedValue('active')
        }
      ];
      (evaluationItemQueue.getJobs as any).mockResolvedValue(activeJobs);

      const stats = await getEvaluationTaskStats(evaluationId);

      expect(stats.total).toBe(5);
      expect(stats.completed).toBe(2); // 有finishTime且无errorMessage的项目
      expect(stats.evaluating).toBe(1); // 队列中活跃的任务
      expect(stats.queuing).toBe(1); // 没有finishTime且不在队列中的项目
      expect(stats.error).toBe(1); // 有errorMessage的项目
    });

    test('应该正确处理空评估任务', async () => {
      (evaluationItemQueue.getJobs as any).mockResolvedValue([]);

      const stats = await getEvaluationTaskStats(evaluationId);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.evaluating).toBe(0);
      expect(stats.queuing).toBe(0);
      expect(stats.error).toBe(0);
    });
  });

  describe('getBatchEvaluationItemStatus', () => {
    test('应该返回多个项目的状态映射', async () => {
      // 创建测试评估项
      const evalItems = await MongoEvalItem.create([
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

      const itemIds = evalItems.map((item) => item._id.toString());

      // Mock 队列状态 - 第二个项目正在执行
      const activeJobs = [
        {
          id: `eval_item_${itemIds[1]}`,
          data: { evalItemId: itemIds[1] },
          getState: vi.fn().mockResolvedValue('active')
        }
      ];
      (evaluationItemQueue.getJobs as any).mockResolvedValue(activeJobs);

      const statusMap = await getBatchEvaluationItemStatus(itemIds);

      expect(statusMap.size).toBe(2);
      expect(statusMap.get(itemIds[0])).toBe(EvaluationStatusEnum.completed);
      expect(statusMap.get(itemIds[1])).toBe(EvaluationStatusEnum.evaluating);
    });

    test('应该正确处理不存在的项目ID', async () => {
      const nonExistentIds = [new Types.ObjectId().toString(), new Types.ObjectId().toString()];

      (evaluationItemQueue.getJobs as any).mockResolvedValue([]);

      const statusMap = await getBatchEvaluationItemStatus(nonExistentIds);

      expect(statusMap.size).toBe(2);
      expect(statusMap.get(nonExistentIds[0])).toBe(EvaluationStatusEnum.queuing);
      expect(statusMap.get(nonExistentIds[1])).toBe(EvaluationStatusEnum.queuing);
    });

    test('应该正确处理空数组', async () => {
      const statusMap = await getBatchEvaluationItemStatus([]);

      expect(statusMap.size).toBe(0);
    });

    test('应该正确处理混合存在和不存在的项目', async () => {
      // 创建一个存在的评估项
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
        finishTime: new Date()
      });

      const existingId = evalItem._id.toString();
      const nonExistentId = new Types.ObjectId().toString();
      const itemIds = [existingId, nonExistentId];

      (evaluationItemQueue.getJobs as any).mockResolvedValue([]);

      const statusMap = await getBatchEvaluationItemStatus(itemIds);

      expect(statusMap.size).toBe(2);
      expect(statusMap.get(existingId)).toBe(EvaluationStatusEnum.completed);
      expect(statusMap.get(nonExistentId)).toBe(EvaluationStatusEnum.queuing);
    });
  });

  describe('队列状态优先级测试', () => {
    test('队列中的活跃任务应该优先于数据库状态', async () => {
      // 创建状态为completed的评估项
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
        finishTime: new Date()
      });
      const itemId = evalItem._id.toString();

      // Mock 队列中有活跃任务
      const mockJob = {
        id: `eval_item_${itemId}`,
        data: { evalItemId: itemId },
        getState: vi.fn().mockResolvedValue('active')
      };
      (evaluationItemQueue.getJobs as any).mockResolvedValue([mockJob]);

      const status = await getEvaluationItemStatus(itemId);

      // 队列状态应该优先，返回evaluating而不是completed
      expect(status).toBe(EvaluationStatusEnum.evaluating);
    });

    test('完成的任务队列状态应该被忽略', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
        finishTime: new Date()
      });
      const itemId = evalItem._id.toString();

      // Mock 队列中有已完成的任务
      const mockJob = {
        id: `eval_item_${itemId}`,
        data: { evalItemId: itemId },
        getState: vi.fn().mockResolvedValue('completed')
      };
      (evaluationItemQueue.getJobs as any).mockResolvedValue([mockJob]);

      const status = await getEvaluationItemStatus(itemId);

      // 应该返回数据库状态
      expect(status).toBe(EvaluationStatusEnum.completed);
    });
  });

  describe('错误处理', () => {
    test('队列查询错误应该返回error状态', async () => {
      // Mock 队列查询失败
      (evaluationTaskQueue.getJobs as any).mockRejectedValue(new Error('Queue error'));

      const status = await getEvaluationTaskStatus(evaluationId);

      expect(status).toBe(EvaluationStatusEnum.error);
    });
  });
});
