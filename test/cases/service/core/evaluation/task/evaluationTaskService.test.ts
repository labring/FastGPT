import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { MongoEvaluation, MongoEvalItem } from '@fastgpt/service/core/evaluation/task/schema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import type {
  CreateEvaluationParams,
  EvalTarget,
  EvaluatorSchema
} from '@fastgpt/global/core/evaluation/type';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';

// Mock all external dependencies
vi.mock('@fastgpt/service/core/evaluation/task/mq');
vi.mock('@fastgpt/service/support/wallet/usage/controller');
vi.mock('@fastgpt/service/common/system/log');
vi.mock('@fastgpt/service/core/evaluation/summary/util/weightCalculator');
vi.mock('@fastgpt/service/core/evaluation/task/statusCalculator');
vi.mock('@fastgpt/service/core/evaluation/summary/queue');

// Mock BullMQ
vi.mock('@fastgpt/service/common/bullmq', () => ({
  getQueue: vi.fn(() => ({
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
    addBulk: vi.fn().mockResolvedValue([{ id: 'bulk-job-1' }, { id: 'bulk-job-2' }]),
    getJob: vi.fn(),
    getJobs: vi.fn().mockResolvedValue([])
  })),
  getWorker: vi.fn(() => ({
    on: vi.fn()
  })),
  QueueNames: {
    evalTask: 'evalTask',
    evalTaskItem: 'evalTaskItem'
  }
}));

describe('EvaluationTaskService Integration Tests', () => {
  let teamId: string;
  let tmbId: string;
  let evalDatasetCollectionId: string;
  let target: EvalTarget;
  let metricId: string;
  let evaluators: EvaluatorSchema[];

  // 通用重试函数处理MongoDB锁冲突
  const retryOnLockError = async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> => {
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        retryCount++;
        if (
          (error?.message?.includes('Collection namespace') &&
            error?.message?.includes('is already in use')) ||
          error?.message?.includes('Unable to acquire IX lock') ||
          error?.code === 50 || // MaxTimeMSExpired
          retryCount < maxRetries
        ) {
          // 等待一段时间后重试
          await new Promise((resolve) => setTimeout(resolve, 100 * retryCount));
          continue;
        }
        throw error; // 非锁冲突错误或重试次数用完，直接抛出
      }
    }
    throw new Error('Max retries exceeded');
  };

  beforeAll(async () => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';

    target = {
      type: 'workflow',
      config: {
        appId: '507f1f77bcf86cd799439011',
        versionId: '507f1f77bcf86cd799439012',
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

    // Setup test data
    const dataset = await MongoEvalDatasetCollection.create({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId),
      name: 'Test Dataset',
      description: 'Dataset for task testing'
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
      name: 'Test Metric',
      description: 'Metric for task testing',
      type: EvalMetricTypeEnum.Custom,
      prompt: 'Please evaluate the quality of the response.',
      llmRequired: true,
      userInputRequired: true,
      actualOutputRequired: true,
      expectedOutputRequired: true,
      createTime: new Date(),
      updateTime: new Date()
    });

    metricId = metric._id.toString();

    evaluators = [
      {
        metric: metric.toObject(),
        runtimeConfig: {
          llm: 'gpt-3.5-turbo'
        },
        thresholdValue: 0.8
      }
    ];

    // Setup mocks
    const { createEvaluationUsage } = await import(
      '@fastgpt/service/support/wallet/usage/controller'
    );
    const { getEvaluationTaskStats } = await import(
      '@fastgpt/service/core/evaluation/task/statusCalculator'
    );
    const { buildEvalDataConfig } = await import(
      '@fastgpt/service/core/evaluation/summary/util/weightCalculator'
    );
    const { removeEvaluationTaskJob, removeEvaluationItemJobs, addEvaluationTaskJob } =
      await import('@fastgpt/service/core/evaluation/task/mq');
    const { removeEvaluationSummaryJobs } = await import(
      '@fastgpt/service/core/evaluation/summary/queue'
    );

    (createEvaluationUsage as any).mockResolvedValue({ billId: new Types.ObjectId() });
    (getEvaluationTaskStats as any).mockResolvedValue({
      total: 2,
      completed: 0,
      evaluating: 0,
      queuing: 2,
      error: 0
    });
    (buildEvalDataConfig as any).mockImplementation((evaluators) => ({
      evaluators: evaluators.map((evaluator) => ({
        metric: evaluator.metric,
        runtimeConfig: evaluator.runtimeConfig,
        thresholdValue: evaluator.thresholdValue ?? 0.8
      })),
      summaryConfigs: evaluators.map((evaluator, index) => ({
        metricId: evaluator.metric._id.toString(),
        metricName: evaluator.metric.name,
        weight: 100,
        calculateType: 'mean',
        score: 0,
        summary: '',
        summaryStatus: 'pending',
        errorReason: '',
        completedItemCount: 0,
        overThresholdItemCount: 0,
        thresholdPassRate: 0
      }))
    }));

    // Mock BullMQ operations to resolve immediately
    (removeEvaluationTaskJob as any).mockResolvedValue({
      removed: 1,
      failed: 0,
      activeJobsCleaned: 0
    });
    (removeEvaluationItemJobs as any).mockResolvedValue({
      removed: 1,
      failed: 0,
      activeJobsCleaned: 0
    });
    (removeEvaluationSummaryJobs as any).mockResolvedValue({
      removed: 1,
      failed: 0,
      activeJobsCleaned: 0
    });
    (addEvaluationTaskJob as any).mockResolvedValue(undefined);
  });

  describe('基本CRUD操作', () => {
    test('应该成功创建评估任务', async () => {
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation',
        description: 'A test evaluation for unit testing',
        evalDatasetCollectionId,
        target: {
          type: 'workflow',
          config: {
            appId: '507f1f77bcf86cd799439013',
            versionId: '507f1f77bcf86cd799439014',
            chatConfig: {}
          }
        },
        evaluators: evaluators,
        autoStart: false
      };

      const evaluation = await retryOnLockError(() =>
        EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        })
      );

      expect(evaluation.name).toBe(params.name);
      expect(evaluation.description).toBe(params.description);
      expect(evaluation.evalDatasetCollectionId.toString()).toBe(evalDatasetCollectionId);
      expect(evaluation.target.type).toBe('workflow');
      expect(evaluation.target.config.appId).toBe('507f1f77bcf86cd799439013');
      expect(evaluation.evaluators).toHaveLength(1);
      expect(evaluation.teamId.toString()).toBe(teamId);
      expect(evaluation.tmbId.toString()).toBe(tmbId);
      expect(Types.ObjectId.isValid(evaluation.usageId)).toBe(true);
    });

    test('应该成功获取评估任务', async () => {
      const params: CreateEvaluationParams = {
        name: 'Get Test Evaluation',
        description: 'Test evaluation for get operation',
        evalDatasetCollectionId,
        target,
        evaluators: evaluators,
        autoStart: false
      };

      const created = await retryOnLockError(() =>
        EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        })
      );

      const evaluation = await EvaluationTaskService.getEvaluation(created._id.toString(), teamId);

      expect(evaluation._id.toString()).toBe(created._id.toString());
      expect(evaluation.name).toBe('Get Test Evaluation');
    });

    test('应该成功更新评估任务', async () => {
      const params: CreateEvaluationParams = {
        name: 'Update Test Evaluation',
        description: 'Original description',
        evalDatasetCollectionId,
        target,
        evaluators: evaluators,
        autoStart: false
      };
      const created = await retryOnLockError(() =>
        EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        })
      );

      const updates = {
        name: 'Updated Test Evaluation',
        description: 'Updated description'
      };

      await EvaluationTaskService.updateEvaluation(created._id.toString(), updates, teamId);

      const updatedEvaluation = await EvaluationTaskService.getEvaluation(
        created._id.toString(),
        teamId
      );
      expect(updatedEvaluation.name).toBe(updates.name);
      expect(updatedEvaluation.description).toBe(updates.description);
    });

    test('应该成功删除评估任务', async () => {
      const params: CreateEvaluationParams = {
        name: 'Delete Test Evaluation',
        description: 'Test evaluation for deletion',
        evalDatasetCollectionId,
        target,
        evaluators: evaluators,
        autoStart: false
      };
      const evaluation = await retryOnLockError(() =>
        EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        })
      );
      const testEvaluationId = evaluation._id.toString();

      await EvaluationTaskService.deleteEvaluation(testEvaluationId, teamId);

      await expect(EvaluationTaskService.getEvaluation(testEvaluationId, teamId)).rejects.toThrow(
        EvaluationErrEnum.evalTaskNotFound
      );
    });
  });

  describe('列表和统计功能', () => {
    test('应该成功获取评估任务列表', async () => {
      await MongoEvaluation.deleteMany({ teamId });

      const params: CreateEvaluationParams = {
        name: 'List Test Evaluation',
        description: 'Test evaluation for list operation',
        evalDatasetCollectionId,
        target,
        evaluators: evaluators,
        autoStart: false
      };
      await retryOnLockError(() =>
        EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        })
      );

      const result = await EvaluationTaskService.listEvaluations(
        teamId,
        0,
        10,
        undefined,
        undefined,
        tmbId,
        true
      );

      expect(Array.isArray(result.list)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.list.length).toBeGreaterThanOrEqual(1);
    });

    test('应该返回正确的统计信息', async () => {
      const params: CreateEvaluationParams = {
        name: 'Stats Test Evaluation',
        description: 'Test evaluation for stats',
        evalDatasetCollectionId,
        target,
        evaluators: evaluators,
        autoStart: false
      };
      const evaluation = await retryOnLockError(() =>
        EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        })
      );

      const stats = await EvaluationTaskService.getEvaluationStats(
        evaluation._id.toString(),
        teamId
      );

      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(0);
      expect(stats.evaluating).toBe(0);
      expect(stats.queuing).toBe(2);
      expect(stats.error).toBe(0);
    });
  });

  describe('错误处理', () => {
    test('缺少必填字段时应该抛出错误', async () => {
      const invalidParams = {
        name: 'Invalid Evaluation'
      };

      await expect(EvaluationTaskService.createEvaluation(invalidParams as any)).rejects.toThrow();
    });

    test('评估任务不存在时应该抛出错误', async () => {
      const nonExistentId = new Types.ObjectId().toString();

      await expect(EvaluationTaskService.getEvaluation(nonExistentId, teamId)).rejects.toThrow(
        EvaluationErrEnum.evalTaskNotFound
      );
    });

    test('数据集为空时应该抛出错误', async () => {
      const emptyDataset = await MongoEvalDatasetCollection.create({
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Empty Dataset',
        description: 'Empty dataset for testing'
      });

      const params: CreateEvaluationParams = {
        name: 'Test with Empty Dataset',
        description: 'Test evaluation with empty dataset',
        evalDatasetCollectionId: emptyDataset._id.toString(),
        target,
        evaluators: evaluators,
        autoStart: false
      };

      await expect(
        EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        })
      ).rejects.toThrow(EvaluationErrEnum.evalDatasetLoadFailed);
    });
  });
});
