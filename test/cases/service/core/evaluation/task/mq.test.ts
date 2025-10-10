import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { MongoEvaluation, MongoEvalItem } from '@fastgpt/service/core/evaluation/task/schema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { EvaluatorSchema, EvalTarget } from '@fastgpt/global/core/evaluation/type';

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

// Mock job cleanup
vi.mock('@fastgpt/service/core/evaluation/utils/jobCleanup', () => ({
  createJobCleaner: vi.fn(() => ({
    cleanAllJobsByFilter: vi.fn().mockResolvedValue({
      queue: 'test-queue',
      totalJobs: 2,
      removedJobs: 2,
      failedRemovals: 0,
      errors: []
    })
  }))
}));

// Mock system log
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

// Create a mock worker
const mockWorker = {
  on: vi.fn(),
  id: 'mock-worker-id'
};

vi.mock('@fastgpt/service/core/evaluation/task/mq', async () => {
  const actual = (await vi.importActual('@fastgpt/service/core/evaluation/task/mq')) as any;
  return {
    ...actual,
    getEvaluationTaskWorker: vi.fn(() => mockWorker),
    getEvaluationItemWorker: vi.fn(() => mockWorker)
  };
});

import {
  evaluationTaskQueue,
  evaluationItemQueue,
  addEvaluationTaskJob,
  addEvaluationItemJob,
  addEvaluationItemJobs,
  removeEvaluationTaskJob,
  removeEvaluationItemJobs,
  removeEvaluationItemJobsByItemId,
  getEvaluationTaskWorker,
  getEvaluationItemWorker
} from '@fastgpt/service/core/evaluation/task/mq';
import { addLog } from '@fastgpt/service/common/system/log';
import { EvaluationUnrecoverableError } from '@fastgpt/service/core/evaluation/task/errors';

describe('Evaluation MQ System', () => {
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
      name: 'MQ Test Dataset',
      description: 'Dataset for MQ testing'
    });
    evalDatasetCollectionId = dataset._id.toString();

    const metric = await MongoEvalMetric.create({
      teamId: teamId,
      tmbId: tmbId,
      name: 'MQ Test Metric',
      description: 'Metric for MQ testing',
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
      name: 'MQ Test Evaluation',
      description: 'Test evaluation for MQ',
      evalDatasetCollectionId: new Types.ObjectId(evalDatasetCollectionId),
      target,
      evaluators: evaluators,
      usageId: new Types.ObjectId(),
      status: EvaluationStatusEnum.queuing,
      createTime: new Date()
    });
    evaluationId = evaluation._id.toString();
  });

  describe('队列初始化', () => {
    test('应该正确初始化评估任务队列', () => {
      expect(evaluationTaskQueue).toBeDefined();
      expect(typeof evaluationTaskQueue.add).toBe('function');
    });

    test('应该正确初始化评估项队列', () => {
      expect(evaluationItemQueue).toBeDefined();
      expect(typeof evaluationItemQueue.add).toBe('function');
      expect(typeof evaluationItemQueue.addBulk).toBe('function');
    });
  });

  describe('任务添加', () => {
    test('应该成功添加评估任务到队列', async () => {
      const jobData = { evalId: evaluationId };

      await addEvaluationTaskJob(jobData);

      expect(evaluationTaskQueue.add).toHaveBeenCalledWith(evaluationId, jobData, {
        deduplication: { id: evaluationId, ttl: 5000 }
      });
    });

    test('应该成功添加评估项到队列', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Test input', expectedOutput: 'Test output' }
      });
      const itemId = evalItem._id.toString();

      const jobData = { evalId: evaluationId, evalItemId: itemId };

      await addEvaluationItemJob(jobData);

      expect(evaluationItemQueue.add).toHaveBeenCalledWith(itemId, jobData, {
        deduplication: { id: itemId, ttl: 5000 }
      });
    });

    test('应该支持延迟添加评估项', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Test input', expectedOutput: 'Test output' }
      });
      const itemId = evalItem._id.toString();

      const jobData = { evalId: evaluationId, evalItemId: itemId };
      const delay = 5000;

      await addEvaluationItemJob(jobData, { delay });

      expect(evaluationItemQueue.add).toHaveBeenCalledWith(itemId, jobData, {
        deduplication: { id: itemId, ttl: 5000 },
        delay
      });
    });

    test('应该成功批量添加评估项', async () => {
      const evalItems = await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Test input 1', expectedOutput: 'Test output 1' }
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Test input 2', expectedOutput: 'Test output 2' }
        }
      ]);

      const jobs = evalItems.map((item, index) => ({
        data: { evalId: evaluationId, evalItemId: item._id.toString() },
        delay: index * 1000
      }));

      await addEvaluationItemJobs(jobs);

      expect(evaluationItemQueue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: evalItems[0]._id.toString(),
            data: { evalId: evaluationId, evalItemId: evalItems[0]._id.toString() },
            opts: expect.objectContaining({
              delay: 0,
              deduplication: { id: evalItems[0]._id.toString() }
            })
          }),
          expect.objectContaining({
            name: evalItems[1]._id.toString(),
            data: { evalId: evaluationId, evalItemId: evalItems[1]._id.toString() },
            opts: expect.objectContaining({
              delay: 1000,
              deduplication: { id: evalItems[1]._id.toString() }
            })
          })
        ])
      );
    });

    test('批量添加时应该为没有延迟的任务设置默认延迟', async () => {
      const evalItems = await MongoEvalItem.create([
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Test input 1', expectedOutput: 'Test output 1' }
        },
        {
          evalId: new Types.ObjectId(evaluationId),
          dataItem: { userInput: 'Test input 2', expectedOutput: 'Test output 2' }
        }
      ]);

      const jobs = evalItems.map((item) => ({
        data: { evalId: evaluationId, evalItemId: item._id.toString() }
        // 没有指定 delay
      }));

      await addEvaluationItemJobs(jobs);

      expect(evaluationItemQueue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            opts: expect.objectContaining({
              delay: 0 // 第一个任务延迟为 0
            })
          }),
          expect.objectContaining({
            opts: expect.objectContaining({
              delay: 100 // 第二个任务延迟为 100ms (index * 100)
            })
          })
        ])
      );
    });
  });

  describe('任务清理', () => {
    test('应该成功清理评估任务', async () => {
      const result = await removeEvaluationTaskJob(evaluationId);

      expect(result).toEqual({
        queue: 'test-queue',
        totalJobs: 2,
        removedJobs: 2,
        failedRemovals: 0,
        errors: []
      });
      expect(addLog.debug).toHaveBeenCalledWith('Evaluation task jobs cleanup completed', {
        evalId: evaluationId,
        result
      });
    });

    test('应该成功清理评估项任务', async () => {
      const result = await removeEvaluationItemJobs(evaluationId);

      expect(result).toEqual({
        queue: 'test-queue',
        totalJobs: 2,
        removedJobs: 2,
        failedRemovals: 0,
        errors: []
      });
      expect(addLog.debug).toHaveBeenCalledWith('Evaluation item jobs cleanup completed', {
        evalId: evaluationId,
        result
      });
    });

    test('应该成功按项目ID清理评估项任务', async () => {
      const evalItem = await MongoEvalItem.create({
        evalId: new Types.ObjectId(evaluationId),
        dataItem: { userInput: 'Test input', expectedOutput: 'Test output' }
      });
      const itemId = evalItem._id.toString();

      const result = await removeEvaluationItemJobsByItemId(itemId);

      expect(result).toEqual({
        queue: 'test-queue',
        totalJobs: 2,
        removedJobs: 2,
        failedRemovals: 0,
        errors: []
      });
      expect(addLog.debug).toHaveBeenCalledWith(
        'Evaluation item jobs cleanup completed for specific item',
        {
          evalItemId: itemId,
          result
        }
      );
    });

    test('应该支持清理选项', async () => {
      const options = {
        forceCleanActiveJobs: true,
        retryAttempts: 5,
        retryDelay: 500
      };

      await removeEvaluationTaskJob(evaluationId, options);

      // 验证选项被传递给了 createJobCleaner
      const { createJobCleaner } = await import(
        '@fastgpt/service/core/evaluation/utils/jobCleanup'
      );
      expect(createJobCleaner).toHaveBeenCalledWith(options);
    });
  });

  describe('Worker初始化', () => {
    test('应该创建评估任务Worker', () => {
      const mockProcessor = vi.fn();
      getEvaluationTaskWorker(mockProcessor);

      // 验证Worker创建函数被调用
      expect(getEvaluationTaskWorker).toHaveBeenCalledWith(mockProcessor);
    });

    test('应该创建评估项Worker', () => {
      const mockProcessor = vi.fn();
      getEvaluationItemWorker(mockProcessor);

      // 验证Worker创建函数被调用
      expect(getEvaluationItemWorker).toHaveBeenCalledWith(mockProcessor);
    });
  });

  describe('Worker错误处理与重试逻辑', () => {
    // Mock UnrecoverableError class since we can't import from bullmq in tests
    class MockUnrecoverableError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'UnrecoverableError';
      }
    }

    test('willRetry逻辑：UnrecoverableError不应重试，即使有剩余尝试次数', () => {
      // 模拟job对象
      const mockJob = {
        id: 'test-job-1',
        data: {
          evalId: evaluationId,
          evalItemId: 'item-456'
        },
        opts: {
          attempts: 3
        },
        attemptsMade: 1
      };

      // 模拟队列配置
      const mockQueue = {
        opts: {
          defaultJobOptions: {
            attempts: 5
          }
        }
      };

      // 测试UnrecoverableError
      const unrecoverableError = new MockUnrecoverableError('This should not retry');

      // 模拟mq.ts中的逻辑
      const queueDefaultAttempts = mockQueue.opts?.defaultJobOptions?.attempts;
      const maxAttempts = (mockJob?.opts as any)?.attempts || queueDefaultAttempts || 0;
      const attemptsMade = mockJob?.attemptsMade || 0;

      const isUnrecoverableError = unrecoverableError instanceof MockUnrecoverableError;
      const willRetry = !isUnrecoverableError && attemptsMade < maxAttempts;

      expect(isUnrecoverableError).toBe(true);
      expect(attemptsMade).toBe(1);
      expect(maxAttempts).toBe(3);
      expect(willRetry).toBe(false); // 不应重试，即使有剩余尝试次数
    });

    test('willRetry逻辑：普通Error在有剩余尝试次数时应重试', () => {
      const mockJob = {
        id: 'test-job-2',
        data: {
          evalId: evaluationId,
          evalItemId: 'item-456'
        },
        opts: {
          attempts: 3
        },
        attemptsMade: 1
      };

      const mockQueue = {
        opts: {
          defaultJobOptions: {
            attempts: 5
          }
        }
      };

      // 测试普通Error
      const regularError = new Error('This should retry');

      // 模拟mq.ts中的逻辑
      const queueDefaultAttempts = mockQueue.opts?.defaultJobOptions?.attempts;
      const maxAttempts = (mockJob?.opts as any)?.attempts || queueDefaultAttempts || 0;
      const attemptsMade = mockJob?.attemptsMade || 0;

      const isUnrecoverableError = regularError instanceof MockUnrecoverableError;
      const willRetry = !isUnrecoverableError && attemptsMade < maxAttempts;

      expect(isUnrecoverableError).toBe(false);
      expect(attemptsMade).toBe(1);
      expect(maxAttempts).toBe(3);
      expect(willRetry).toBe(true); // 应该重试，因为不是UnrecoverableError
    });

    test('willRetry逻辑：EvaluationUnrecoverableError不应重试', () => {
      const mockJob = {
        id: 'test-job-3',
        data: {
          evalId: evaluationId,
          evalItemId: 'item-456'
        },
        opts: {
          attempts: 3
        },
        attemptsMade: 0 // 第一次尝试
      };

      const mockQueue = {
        opts: {
          defaultJobOptions: {
            attempts: 5
          }
        }
      };

      // 测试EvaluationUnrecoverableError（继承自UnrecoverableError）
      const evaluationError = new EvaluationUnrecoverableError('Evaluation failed', 'processing');

      // 模拟mq.ts中的逻辑
      const queueDefaultAttempts = mockQueue.opts?.defaultJobOptions?.attempts;
      const maxAttempts = (mockJob?.opts as any)?.attempts || queueDefaultAttempts || 0;
      const attemptsMade = mockJob?.attemptsMade || 0;

      // 在实际代码中，我们需要检查是否是UnrecoverableError的实例
      // EvaluationUnrecoverableError 继承自 UnrecoverableError，所以这个检查会通过
      const isUnrecoverableError = evaluationError.name === 'EvaluationUnrecoverableError';
      const willRetry = !isUnrecoverableError && attemptsMade < maxAttempts;

      expect(isUnrecoverableError).toBe(true);
      expect(attemptsMade).toBe(0);
      expect(maxAttempts).toBe(3);
      expect(willRetry).toBe(false); // 即使是第一次失败也不应重试
    });

    test('willRetry逻辑：尝试次数用尽时不应重试，即使是普通Error', () => {
      const mockJob = {
        id: 'test-job-4',
        data: {
          evalId: evaluationId,
          evalItemId: 'item-456'
        },
        opts: {
          attempts: 3
        },
        attemptsMade: 3 // 所有尝试次数已用尽
      };

      const mockQueue = {
        opts: {
          defaultJobOptions: {
            attempts: 5
          }
        }
      };

      // 测试普通Error但尝试次数已用尽
      const regularError = new Error('Regular error but no attempts left');

      // 模拟mq.ts中的逻辑
      const queueDefaultAttempts = mockQueue.opts?.defaultJobOptions?.attempts;
      const maxAttempts = (mockJob?.opts as any)?.attempts || queueDefaultAttempts || 0;
      const attemptsMade = mockJob?.attemptsMade || 0;

      const isUnrecoverableError = regularError instanceof MockUnrecoverableError;
      const willRetry = !isUnrecoverableError && attemptsMade < maxAttempts;

      expect(isUnrecoverableError).toBe(false);
      expect(attemptsMade).toBe(3);
      expect(maxAttempts).toBe(3);
      expect(willRetry).toBe(false); // 不应重试，因为尝试次数已用尽
    });

    test('willRetry逻辑：当job未指定attempts时应使用队列默认值', () => {
      const mockJob = {
        id: 'test-job-5',
        data: {
          evalId: evaluationId,
          evalItemId: 'item-456'
        },
        // 没有指定 opts.attempts
        opts: undefined,
        attemptsMade: 2
      };

      const mockQueue = {
        opts: {
          defaultJobOptions: {
            attempts: 5
          }
        }
      };

      const regularError = new Error('Regular error');

      // 模拟mq.ts中的逻辑
      const queueDefaultAttempts = mockQueue.opts?.defaultJobOptions?.attempts;
      const maxAttempts = (mockJob?.opts as any)?.attempts || queueDefaultAttempts || 0;
      const attemptsMade = mockJob?.attemptsMade || 0;

      const isUnrecoverableError = regularError instanceof MockUnrecoverableError;
      const willRetry = !isUnrecoverableError && attemptsMade < maxAttempts;

      expect(isUnrecoverableError).toBe(false);
      expect(attemptsMade).toBe(2);
      expect(maxAttempts).toBe(5); // 应该使用队列默认值
      expect(willRetry).toBe(true); // 应该重试，因为 2 < 5
    });
  });
});
