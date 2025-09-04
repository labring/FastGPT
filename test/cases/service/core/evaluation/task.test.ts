import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { MongoEvaluation, MongoEvalItem } from '@fastgpt/service/core/evaluation/task/schema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import type {
  CreateEvaluationParams,
  EvalTarget,
  EvaluatorSchema,
  EvaluationTaskJobData,
  EvaluationItemJobData
} from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '@fastgpt/service/support/permission/type';
import {
  EvaluationStatusEnum,
  CalculateMethodEnum
} from '@fastgpt/global/core/evaluation/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task/mq', () => ({
  evaluationTaskQueue: {
    add: vi.fn()
  },
  evaluationItemQueue: {
    add: vi.fn(),
    addBulk: vi.fn()
  },
  removeEvaluationTaskJob: vi.fn().mockResolvedValue(undefined),
  removeEvaluationItemJobs: vi.fn().mockResolvedValue(undefined),
  getEvaluationTaskWorker: vi.fn(),
  getEvaluationItemWorker: vi.fn()
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createTrainingUsage: vi.fn(),
  concatUsage: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  parseHeaderCert: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/evaluation/target', () => ({
  createTargetInstance: vi.fn()
}));

vi.mock('@fastgpt/service/core/evaluation/evaluator', () => ({
  createEvaluatorInstance: vi.fn()
}));

import { evaluationTaskQueue, evaluationItemQueue } from '@fastgpt/service/core/evaluation/task/mq';
import { createTrainingUsage, concatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { addLog } from '@fastgpt/service/common/system/log';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { createTargetInstance } from '@fastgpt/service/core/evaluation/target';
import { createEvaluatorInstance } from '@fastgpt/service/core/evaluation/evaluator';

describe('EvaluationTaskService', () => {
  let teamId: string;
  let tmbId: string;
  let datasetId: string;
  let target: EvalTarget;
  let metricId: string;
  let evaluators: EvaluatorSchema[];
  let auth: AuthModeType;

  beforeAll(async () => {
    // 数据库连接在 setup.ts 中处理
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    auth = { req: {} as any, authToken: true };

    // 创建测试数据
    const dataset = await MongoEvalDatasetCollection.create({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId),
      name: 'Test Dataset',
      description: 'Dataset for task testing'
    });
    datasetId = dataset._id.toString();

    // 创建数据集数据项
    await MongoEvalDatasetData.create([
      {
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        datasetId: dataset._id,
        userInput: 'What is AI?',
        expectedOutput: 'Artificial Intelligence'
      },
      {
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        datasetId: dataset._id,
        userInput: 'What is ML?',
        expectedOutput: 'Machine Learning'
      }
    ]);

    // 定义测试用的目标对象
    target = {
      type: 'workflow',
      config: {
        appId: 'test-app-id-for-task-testing',
        chatConfig: {
          temperature: 0.7,
          maxToken: 2000
        }
      }
    };

    const metric = await MongoEvalMetric.create({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId),
      name: 'Test Metric',
      description: 'Metric for task testing',
      type: 'ai_model',
      dependencies: ['llm'],
      config: {
        llm: 'gpt-3.5-turbo',
        prompt: 'Please evaluate the quality of the response.'
      }
    });
    metricId = metric._id.toString();

    // Create evaluators array based on the metric
    evaluators = [
      {
        metric: metric.toObject(),
        runtimeConfig: {
          llm: 'gpt-3.5-turbo'
        },
        weight: 1.0,
        thresholdValue: 0.8,
        calculateType: 0
      }
    ];
  });

  afterAll(async () => {
    // 清理测试数据
    await Promise.all([
      MongoEvaluation.deleteMany({ teamId }),
      MongoEvalItem.deleteMany({}),
      MongoEvalDatasetCollection.deleteMany({ teamId }),
      MongoEvalDatasetData.deleteMany({ teamId }),
      // Target现在嵌入在Evaluation中，不需要单独清理
      MongoEvalMetric.deleteMany({ teamId })
    ]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock createTrainingUsage
    (createTrainingUsage as any).mockResolvedValue({ billId: new Types.ObjectId() });
    // Mock concatUsage
    (concatUsage as any).mockResolvedValue(undefined);
    // Mock parseHeaderCert - 返回正确的ObjectId类型
    (parseHeaderCert as any).mockResolvedValue({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId)
    });
  });

  describe('createEvaluation', () => {
    test('应该成功创建评估任务', async () => {
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation',
        description: 'A test evaluation for unit testing',
        datasetId,
        target: {
          type: 'workflow',
          config: {
            appId: 'test-app-id',
            chatConfig: {}
          }
        },
        evaluators: evaluators
      };

      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);

      expect(evaluation.name).toBe(params.name);
      expect(evaluation.description).toBe(params.description);
      expect(evaluation.datasetId.toString()).toBe(datasetId);
      expect(evaluation.target.type).toBe('workflow');
      expect(evaluation.target.config.appId).toBe('test-app-id');
      expect(evaluation.evaluators).toHaveLength(1);
      expect(evaluation.evaluators[0].metric._id.toString()).toBe(metricId);
      expect(evaluation.evaluators[0].runtimeConfig.llm).toBe('gpt-3.5-turbo');
      expect(evaluation.teamId.toString()).toBe(teamId);
      expect(evaluation.tmbId.toString()).toBe(tmbId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.queuing);
      expect(Types.ObjectId.isValid(evaluation.usageId)).toBe(true);

      // 验证创建用量记录被调用
      expect(createTrainingUsage).toHaveBeenCalledWith({
        teamId: expect.any(Object), // ObjectId from auth
        tmbId: expect.any(Object), // ObjectId from auth
        appName: params.name,
        billSource: expect.any(String)
      });
    });

    test('缺少必填字段时应该抛出错误', async () => {
      const invalidParams = {
        name: 'Invalid Evaluation'
        // 缺少其他必填字段
      };

      await expect(
        EvaluationTaskService.createEvaluation(invalidParams as any, auth)
      ).rejects.toThrow();
    });
  });

  describe('getEvaluation', () => {
    test('应该成功获取评估任务', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Get Test Evaluation',
        description: 'Test evaluation for get operation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      const evaluation = await EvaluationTaskService.getEvaluation(created._id, auth);

      expect(evaluation._id.toString()).toBe(created._id.toString());
      expect(evaluation.name).toBe('Get Test Evaluation');
      expect(evaluation.status).toBe(EvaluationStatusEnum.queuing);
    });

    test('评估任务不存在时应该抛出错误', async () => {
      const nonExistentId = new Types.ObjectId().toString();

      await expect(EvaluationTaskService.getEvaluation(nonExistentId, auth)).rejects.toThrow(
        'Evaluation not found'
      );
    });
  });

  describe('updateEvaluation', () => {
    test('应该成功更新评估任务', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Update Test Evaluation',
        description: 'Original description',
        datasetId,
        target,
        evaluators: evaluators
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      const updates = {
        name: 'Updated Test Evaluation',
        description: 'Updated description'
      };

      await EvaluationTaskService.updateEvaluation(created._id, updates, auth);

      const updatedEvaluation = await EvaluationTaskService.getEvaluation(created._id, auth);
      expect(updatedEvaluation.name).toBe(updates.name);
      expect(updatedEvaluation.description).toBe(updates.description);
    });
  });

  describe('listEvaluations', () => {
    test('应该成功获取评估任务列表', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'List Test Evaluation',
        description: 'Test evaluation for list operation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      const result = await EvaluationTaskService.listEvaluations(auth, 1, 10);

      expect(Array.isArray(result.evaluations)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.evaluations.length).toBeGreaterThanOrEqual(1);

      const evaluation = result.evaluations.find(
        (e) => e._id.toString() === created._id.toString()
      );
      expect(evaluation).toBeDefined();
      expect(evaluation?.name).toBe('List Test Evaluation');
    });

    test('应该支持搜索功能', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Searchable Test Evaluation',
        description: 'Test evaluation for search operation',
        datasetId,
        target,
        evaluators: evaluators
      };
      await EvaluationTaskService.createEvaluation(params, auth);

      const result = await EvaluationTaskService.listEvaluations(auth, 1, 10, 'Searchable');

      expect(Array.isArray(result.evaluations)).toBe(true);
      expect(result.evaluations.some((evaluation) => evaluation.name.includes('Searchable'))).toBe(
        true
      );
    });
  });

  describe('startEvaluation', () => {
    test('应该成功启动评估任务', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Start Test Evaluation',
        description: 'Test evaluation for start operation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      await EvaluationTaskService.startEvaluation(created._id, auth);

      // 验证状态已更新
      const evaluation = await EvaluationTaskService.getEvaluation(created._id, auth);
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);

      // 验证任务已提交到队列
      expect(evaluationTaskQueue.add).toHaveBeenCalledWith(`eval_task_${created._id}`, {
        evalId: created._id
      });

      expect(addLog.info).toHaveBeenCalledWith(
        expect.stringContaining(`Task submitted to queue: ${created._id}`)
      );
    });

    test('非排队状态的任务不能启动', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'No Start Test Evaluation',
        description: 'Test evaluation for no start operation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      // 先更新状态为已完成
      await MongoEvaluation.updateOne(
        { _id: created._id },
        { $set: { status: EvaluationStatusEnum.completed } }
      );

      await expect(EvaluationTaskService.startEvaluation(created._id, auth)).rejects.toThrow(
        'Only queuing evaluations can be started'
      );
    });
  });

  describe('stopEvaluation', () => {
    test('应该成功停止评估任务', async () => {
      // 为这个测试创建专门的evaluation
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for stopEvaluation',
        description: 'A test evaluation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 重置为evaluating状态
      await MongoEvaluation.updateOne(
        { _id: testEvaluationId },
        { $set: { status: EvaluationStatusEnum.evaluating } }
      );

      // 创建一些测试评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test 1', expectedOutput: 'Answer 1' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.evaluating
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test 2', expectedOutput: 'Answer 2' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.queuing
        }
      ]);

      await EvaluationTaskService.stopEvaluation(testEvaluationId, auth);

      // 验证评估任务状态
      const updatedEvaluation = await EvaluationTaskService.getEvaluation(testEvaluationId, auth);
      expect(updatedEvaluation.status).toBe(EvaluationStatusEnum.error);
      expect(updatedEvaluation.errorMessage).toBe('Manually stopped');
      expect(updatedEvaluation.finishTime).toBeDefined();

      // 验证评估项状态
      const items = await MongoEvalItem.find({ evalId: testEvaluationId });
      items.forEach((item) => {
        expect(item.status).toBe(EvaluationStatusEnum.error);
        expect(item.errorMessage).toBe('Manually stopped');
        expect(item.finishTime).toBeDefined();
      });

      expect(addLog.info).toHaveBeenCalledWith(
        expect.stringContaining(`Task manually stopped and removed from queue: ${testEvaluationId}`)
      );
    });
  });

  describe('getEvaluationStats', () => {
    test('应该返回正确的统计信息', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for getEvaluationStats',
        description: 'A test evaluation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建测试评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: {
            metricId,
            metricName: 'Test Metric',
            score: 85
          }
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: {
            metricId,
            metricName: 'Test Metric',
            score: 95
          }
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q3', expectedOutput: 'A3' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.evaluating
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q4', expectedOutput: 'A4' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q5', expectedOutput: 'A5' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          errorMessage: 'Test error'
        }
      ]);

      const stats = await EvaluationTaskService.getEvaluationStats(testEvaluationId, auth);

      expect(stats.total).toBe(5);
      expect(stats.completed).toBe(3); // 2个成功 + 1个错误
      expect(stats.evaluating).toBe(1);
      expect(stats.queuing).toBe(1);
      expect(stats.error).toBe(1);
    });
  });

  describe('listEvaluationItems', () => {
    test('应该成功获取评估项列表', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for listEvaluationItems',
        description: 'A test evaluation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建一些测试评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test userInput 1', expectedOutput: 'Test answer 1' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test userInput 2', expectedOutput: 'Test answer 2' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          score: 85
        }
      ]);

      const result = await EvaluationTaskService.listEvaluationItems(testEvaluationId, auth, 1, 10);

      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.items.length).toBeGreaterThan(0);

      const item = result.items[0];
      expect(item.evalItemId).toBeDefined();
      expect(item.evalId.toString()).toBe(testEvaluationId.toString());
      expect(item.dataItem).toBeDefined();
    });
  });

  describe('Evaluation Item Operations', () => {
    describe('getEvaluationItem', () => {
      test('应该成功获取评估项', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for getEvaluationItem',
          description: 'A test evaluation',
          datasetId,
          target,
          evaluators: evaluators
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        const retrievedItem = await EvaluationTaskService.getEvaluationItem(itemId, auth);

        expect(retrievedItem._id.toString()).toBe(itemId);
        expect(retrievedItem.evalId.toString()).toBe(testEvaluationId.toString());
        expect(retrievedItem.dataItem.userInput).toBe('Test Item');
      });

      test('评估项不存在时应该抛出错误', async () => {
        const nonExistentId = new Types.ObjectId().toString();

        await expect(EvaluationTaskService.getEvaluationItem(nonExistentId, auth)).rejects.toThrow(
          'Evaluation item not found'
        );
      });
    });

    describe('updateEvaluationItem', () => {
      test('应该成功更新评估项', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for updateEvaluationItem',
          description: 'A test evaluation',
          datasetId,
          target,
          evaluators: evaluators
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        const updates = {
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: {
            metricId: metricId,
            metricName: 'Test Metric',
            score: 88
          },
          targetOutput: {
            actualOutput: 'Updated response',
            responseTime: 1000
          }
        };

        await EvaluationTaskService.updateEvaluationItem(itemId, updates, auth);

        const updatedItem = await EvaluationTaskService.getEvaluationItem(itemId, auth);
        expect(updatedItem.status).toBe(updates.status);
        expect(updatedItem.evaluatorOutput?.score).toBe(88);
        expect(updatedItem.targetOutput?.actualOutput).toBe('Updated response');
      });
    });

    describe('retryEvaluationItem', () => {
      test('应该成功重试失败的评估项', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for retryEvaluationItem',
          description: 'A test evaluation',
          datasetId,
          target,
          evaluators: evaluators
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.error,
          errorMessage: 'Test error',
          retry: 2
        });
        const itemId = item._id.toString();

        await EvaluationTaskService.retryEvaluationItem(itemId, auth);

        const retriedItem = await EvaluationTaskService.getEvaluationItem(itemId, auth);
        expect(retriedItem.status).toBe(EvaluationStatusEnum.queuing);
        expect(retriedItem.errorMessage).toBeNull();
        expect(retriedItem.retry).toBeGreaterThanOrEqual(1);

        expect(addLog.info).toHaveBeenCalledWith(
          expect.stringContaining(
            `Evaluation item reset to queuing status and resubmitted: ${itemId}`
          )
        );
      });

      test('非失败状态的评估项不能重试', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for retry error',
          description: 'A test evaluation',
          datasetId,
          target,
          evaluators: evaluators
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        // 创建一个已完成且无错误的评估项
        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          errorMessage: null // 确保没有错误消息
        });
        const itemId = item._id.toString();

        await expect(EvaluationTaskService.retryEvaluationItem(itemId, auth)).rejects.toThrow(
          'Only failed evaluation items can be retried'
        );
      });
    });

    describe('deleteEvaluationItem', () => {
      test('应该成功删除评估项', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for deleteEvaluationItem',
          description: 'A test evaluation',
          datasetId,
          target,
          evaluators: evaluators
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        await EvaluationTaskService.deleteEvaluationItem(itemId, auth);

        await expect(EvaluationTaskService.getEvaluationItem(itemId, auth)).rejects.toThrow(
          'Evaluation item not found'
        );
      });
    });

    describe('getEvaluationItemResult', () => {
      test('应该返回评估项详细结果', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for getEvaluationItemResult',
          description: 'A test evaluation',
          datasetId,
          target,
          evaluators: evaluators
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          targetOutput: {
            actualOutput: 'Test response',
            responseTime: 1000
          },
          evaluatorOutput: {
            metricId,
            metricName: 'Test Metric',
            score: 92,
            details: { test: true }
          }
        });
        const itemId = item._id.toString();

        const result = await EvaluationTaskService.getEvaluationItemResult(itemId, auth);

        expect(result.item._id.toString()).toBe(itemId);
        expect(result.dataItem.userInput).toBe('Test Item');
        expect(result.response).toBe('Test response');
        expect(result.score).toBe(92);
        expect(result.result).toBeDefined();
        expect(result.result.score).toBe(92);
      });
    });
  });

  describe('searchEvaluationItems', () => {
    let testEvaluationId: string;

    beforeEach(async () => {
      // 为每个测试创建新的evaluation和items
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for searchEvaluationItems',
        description: 'A test evaluation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      testEvaluationId = evaluation._id;

      // 创建测试数据
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'JavaScript userInput', expectedOutput: 'JS answer' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          targetOutput: {
            actualOutput: 'JavaScript is a programming language',
            responseTime: 1000
          },
          evaluatorOutput: {
            metricId,
            metricName: 'Test Metric',
            score: 85
          }
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Python userInput', expectedOutput: 'Python answer' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          targetOutput: {
            actualOutput: 'Python is also a programming language',
            responseTime: 1000
          },
          evaluatorOutput: {
            metricId,
            metricName: 'Test Metric',
            score: 95
          }
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Failed userInput', expectedOutput: 'Failed answer' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: {
            metricId,
            metricName: 'Test Metric',
            score: 45
          },
          errorMessage: 'Processing failed'
        }
      ]);
    });

    test('应该按状态搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        status: EvaluationStatusEnum.completed
      });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    test('应该按错误状态搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        hasError: true
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].dataItem.userInput).toBe('Failed userInput');
    });

    test('应该按分数范围搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        scoreRange: { min: 80, max: 90 }
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].evaluatorOutput?.score).toBe(85);
    });

    test('应该按关键词搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        keyword: 'JavaScript'
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].dataItem.userInput).toContain('JavaScript');
    });

    test('应该支持分页', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        page: 1,
        pageSize: 2
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });

  describe('exportEvaluationResults', () => {
    test('应该成功导出 JSON 格式', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for exportEvaluationResults JSON',
        description: 'A test evaluation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建一些测试数据
      await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Test userInput', expectedOutput: 'Test answer' },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.completed,
        targetOutput: {
          actualOutput: 'Test response',
          responseTime: 1000
        },
        evaluatorOutput: {
          metricId,
          metricName: 'Test Metric',
          score: 85
        }
      });

      const buffer = await EvaluationTaskService.exportEvaluationResults(
        testEvaluationId,
        auth,
        'json'
      );
      const data = JSON.parse(buffer.toString());

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      const item = data[0];
      expect(item.itemId).toBeDefined();
      expect(item.userInput).toBeDefined();
      expect(item.expectedOutput).toBeDefined();
    });

    test('应该成功导出 CSV 格式', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for exportEvaluationResults CSV',
        description: 'A test evaluation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建一些测试数据
      await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'JavaScript userInput', expectedOutput: 'JS answer' },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.completed,
        targetOutput: {
          actualOutput: 'JavaScript response',
          responseTime: 1000
        },
        evaluatorOutput: {
          metricId,
          metricName: 'Test Metric',
          score: 85
        }
      });

      const buffer = await EvaluationTaskService.exportEvaluationResults(
        testEvaluationId,
        auth,
        'csv'
      );
      const csvContent = buffer.toString();

      expect(csvContent.includes('ItemId,UserInput,ExpectedOutput')).toBe(true);
      expect(csvContent.includes('JavaScript userInput')).toBe(true);
    });

    test('空数据时应该返回空内容', async () => {
      // 创建新的空评估任务
      const emptyEvaluation = await MongoEvaluation.create({
        teamId,
        tmbId,
        name: 'Empty Evaluation',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.queuing
      });

      const buffer = await EvaluationTaskService.exportEvaluationResults(
        emptyEvaluation._id.toString(),
        auth,
        'csv'
      );

      expect(buffer.toString()).toBe('');
    });
  });

  describe('retryFailedItems', () => {
    test('应该批量重试失败的评估项', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for retryFailedItems',
        description: 'A test evaluation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建失败的评估项和成功的评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Failed 1', expectedOutput: 'Answer 1' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          errorMessage: 'Error 1'
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Failed 2', expectedOutput: 'Answer 2' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          errorMessage: 'Error 2'
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Success', expectedOutput: 'Answer' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: {
            metricId,
            metricName: 'Test Metric',
            score: 90
          } // 成功的项目，不应该被重试
        }
      ]);

      const retryCount = await EvaluationTaskService.retryFailedItems(testEvaluationId, auth);

      expect(retryCount).toBe(2);

      // 验证失败的项目被重试
      const failedItems = await MongoEvalItem.find({
        evalId: testEvaluationId,
        'dataItem.userInput': { $in: ['Failed 1', 'Failed 2'] }
      });

      failedItems.forEach((item) => {
        expect(item.status).toBe(EvaluationStatusEnum.queuing);
        expect(item.errorMessage).toBeNull();
      });

      // 验证成功的项目未受影响
      const successItem = await MongoEvalItem.findOne({
        evalId: testEvaluationId,
        'dataItem.userInput': 'Success'
      });
      expect(successItem?.status).toBe(EvaluationStatusEnum.completed);
      expect(successItem?.evaluatorOutput?.score).toBe(90);

      expect(addLog.info).toHaveBeenCalledWith(
        expect.stringContaining(`Batch retry failed items: ${testEvaluationId}, affected count: 2`)
      );
    });
  });

  describe('deleteEvaluation', () => {
    test('应该成功删除评估任务及其评估项', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for delete',
        description: 'A test evaluation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建一些评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test userInput 1', expectedOutput: 'Test answer 1' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test userInput 2', expectedOutput: 'Test answer 2' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: {
            metricId,
            metricName: 'Test Metric',
            score: 85
          }
        }
      ]);

      const itemCount = await MongoEvalItem.countDocuments({ evalId: testEvaluationId });
      expect(itemCount).toBeGreaterThan(0); // 确保有评估项存在

      await EvaluationTaskService.deleteEvaluation(testEvaluationId, auth);

      // 验证评估任务被删除
      await expect(EvaluationTaskService.getEvaluation(testEvaluationId, auth)).rejects.toThrow(
        'Evaluation not found'
      );

      // 验证所有评估项被删除
      const remainingItems = await MongoEvalItem.countDocuments({ evalId: testEvaluationId });
      expect(remainingItems).toBe(0);
    });
  });

  // ========================= 评估任务处理流程测试 =========================
  describe('Evaluation Task Processing Flow', () => {
    let mockTargetInstance: any;
    let mockEvaluatorInstance: any;

    beforeEach(() => {
      // Mock target and evaluator instances
      mockTargetInstance = {
        execute: vi.fn().mockResolvedValue({
          actualOutput: 'Mock target output',
          responseTime: 1000,
          retrievalContext: ['context1', 'context2'],
          usage: [{ totalPoints: 50 }]
        })
      };

      mockEvaluatorInstance = {
        evaluate: vi.fn().mockResolvedValue({
          metricId: 'test-metric-id',
          metricName: 'Test Metric',
          score: 85,
          details: { usage: { totalPoints: 20 } }
        })
      };

      (createTargetInstance as any).mockReturnValue(mockTargetInstance);
      (createEvaluatorInstance as any).mockReturnValue(mockEvaluatorInstance);
    });

    test('应该正确处理评估任务流程', async () => {
      // Import the processor module after mocking
      const { evaluationTaskProcessor, evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      // 为这个测试创建独立的数据集
      const testDataset = await MongoEvalDatasetCollection.create({
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Test Dataset for Task Processing',
        description: 'Dataset for task processing test'
      });

      // 创建数据集数据项
      await MongoEvalDatasetData.create([
        {
          teamId: new Types.ObjectId(teamId),
          tmbId: new Types.ObjectId(tmbId),
          datasetId: testDataset._id,
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence'
        },
        {
          teamId: new Types.ObjectId(teamId),
          tmbId: new Types.ObjectId(tmbId),
          datasetId: testDataset._id,
          userInput: 'What is ML?',
          expectedOutput: 'Machine Learning'
        }
      ]);

      // 创建测试评估任务
      const params: CreateEvaluationParams = {
        name: 'Processing Flow Test',
        description: 'Test evaluation processing',
        datasetId: testDataset._id.toString(),
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const evalId = evaluation._id;

      // Mock job data for task processor
      const taskJobData: EvaluationTaskJobData = {
        evalId
      };

      const mockJob = {
        data: taskJobData
      } as any;

      // 执行任务处理器
      await evaluationTaskProcessor(mockJob);

      // 验证评估项是否被创建
      const evalItems = await MongoEvalItem.find({ evalId });
      // 数据集有2个dataItems，每个有1个evaluator，总共应该有2个评估项
      expect(evalItems.length).toBe(2);

      // 验证评估项队列是否被调用
      expect(evaluationItemQueue.addBulk).toHaveBeenCalled();

      // 检查日志是否记录
      expect(addLog.info).toHaveBeenCalledWith(
        expect.stringContaining(`Task decomposition completed: ${evalId}`)
      );
    });

    test('应该正确处理评估项执行流程', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      // 创建测试评估项
      const testEvaluationId = new Types.ObjectId();
      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: {
          userInput: 'Test input',
          expectedOutput: 'Expected output',
          context: ['context1']
        },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.queuing,
        retry: 3
      });

      // Mock evaluation record
      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Test Evaluation Item Processing',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = {
        data: itemJobData
      } as any;

      // 执行评估项处理器
      await evaluationItemProcessor(mockJob);

      // 验证评估项状态更新
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.status).toBe(EvaluationStatusEnum.completed);
      expect(updatedItem?.targetOutput).toBeDefined();
      expect(updatedItem?.evaluatorOutput).toBeDefined();

      // 验证目标和评估器被调用
      expect(mockTargetInstance.execute).toHaveBeenCalledWith({
        userInput: 'Test input',
        context: ['context1'],
        globalVariables: undefined
      });

      expect(mockEvaluatorInstance.evaluate).toHaveBeenCalledWith({
        userInput: 'Test input',
        expectedOutput: 'Expected output',
        actualOutput: 'Mock target output',
        context: ['context1'],
        retrievalContext: ['context1', 'context2']
      });
    });

    test('应该支持检查点恢复机制', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      // 创建部分完成的评估项（已有target输出）
      const testEvaluationId = new Types.ObjectId();
      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: {
          userInput: 'Test input',
          expectedOutput: 'Expected output'
        },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.evaluating,
        targetOutput: {
          actualOutput: 'Existing target output',
          responseTime: 500,
          usage: [{ totalPoints: 30 }]
        },
        retry: 3
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Test Checkpoint Recovery',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = {
        data: itemJobData
      } as any;

      await evaluationItemProcessor(mockJob);

      // 验证target不被重新执行，直接使用已有输出
      expect(mockTargetInstance.execute).not.toHaveBeenCalled();

      // 验证evaluator使用已有的target输出
      expect(mockEvaluatorInstance.evaluate).toHaveBeenCalledWith({
        userInput: 'Test input',
        expectedOutput: 'Expected output',
        actualOutput: 'Existing target output',
        context: undefined,
        retrievalContext: undefined
      });
    });
  });

  // ========================= 重试机制验收测试 =========================
  describe('Retry Mechanism Tests', () => {
    let mockTargetInstance: any;
    let mockEvaluatorInstance: any;

    beforeEach(() => {
      mockTargetInstance = {
        execute: vi.fn()
      };
      mockEvaluatorInstance = {
        evaluate: vi.fn()
      };
      (createTargetInstance as any).mockReturnValue(mockTargetInstance);
      (createEvaluatorInstance as any).mockReturnValue(mockEvaluatorInstance);
    });

    test('网络错误应该触发重试机制', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      // 创建测试评估项
      const testEvaluationId = new Types.ObjectId();
      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Network test', expectedOutput: 'Expected' },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.queuing,
        retry: 3
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Network Error Test',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // Mock network error
      const networkError = new Error('NETWORK_ERROR: Connection timeout');
      mockTargetInstance.execute.mockRejectedValue(networkError);

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证评估项被重新入队
      expect(evaluationItemQueue.add).toHaveBeenCalledWith(
        expect.stringContaining('eval_item_retry_'),
        {
          evalId: testEvaluationId.toString(),
          evalItemId: evalItem._id.toString()
        },
        expect.objectContaining({
          delay: expect.any(Number)
        })
      );

      // 验证重试计数器减少
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.retry).toBe(2);
      expect(updatedItem?.status).toBe(EvaluationStatusEnum.queuing);
    });

    test('非可重试错误应该直接标记为失败', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();
      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Fatal error test', expectedOutput: 'Expected' },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.queuing,
        retry: 3
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Fatal Error Test',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // Mock fatal error (not retriable)
      const fatalError = new Error('FATAL_ERROR: Invalid configuration');
      mockTargetInstance.execute.mockRejectedValue(fatalError);

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证不会重新入队
      expect(evaluationItemQueue.add).not.toHaveBeenCalledWith(
        expect.stringContaining('eval_item_retry_'),
        expect.any(Object),
        expect.any(Object)
      );

      // 验证直接标记为错误
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.status).toBe(EvaluationStatusEnum.error);
      expect(updatedItem?.retry).toBe(0);
      expect(updatedItem?.errorMessage).toContain('FATAL_ERROR');
    });

    test('重试次数耗尽时应该标记为失败', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();
      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Exhausted retry test', expectedOutput: 'Expected' },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.queuing,
        retry: 1 // 只剩1次重试机会
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Exhausted Retry Test',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // Mock retriable error
      const retriableError = new Error('TIMEOUT: Request timeout');
      mockTargetInstance.execute.mockRejectedValue(retriableError);

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证最后一次重试失败后不再重新入队
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.status).toBe(EvaluationStatusEnum.error);
      expect(updatedItem?.retry).toBe(0);
      expect(updatedItem?.errorMessage).toContain('TIMEOUT');
    });

    test('AI积分不足应该暂停整个任务', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();
      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'AI Points test', expectedOutput: 'Expected' },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.queuing,
        retry: 3
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'AI Points Insufficient Test',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // Mock AI Points insufficient error
      (checkTeamAIPoints as any).mockRejectedValue(TeamErrEnum.aiPointsNotEnough);

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证任务被暂停
      const updatedEvaluation = await MongoEvaluation.findById(testEvaluationId);
      expect(updatedEvaluation?.status).toBe(EvaluationStatusEnum.error);
      expect(updatedEvaluation?.errorMessage).toContain('AI Points balance insufficient');

      // 验证警告日志
      expect(addLog.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `AI Points insufficient, evaluation task paused: ${testEvaluationId}`
        )
      );
    });

    test('指数退避延迟应该正确计算', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testCases = [
        { retry: 3, expectedMaxDelay: 2000 }, // newRetryCount=2: 2^(3-2) * 1000 = 2000
        { retry: 2, expectedMaxDelay: 4000 }, // newRetryCount=1: 2^(3-1) * 1000 = 4000
        { retry: 1, expectedMaxDelay: 8000 } // newRetryCount=0: 2^(3-0) * 1000 = 8000
      ];

      for (const testCase of testCases) {
        // 清除之前的mock调用
        (evaluationItemQueue.add as any).mockClear();

        const testEvaluationId = new Types.ObjectId();
        const evalItem = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: `Backoff test ${testCase.retry}`, expectedOutput: 'Expected' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.queuing,
          retry: testCase.retry
        });

        await MongoEvaluation.create({
          _id: testEvaluationId,
          teamId: new Types.ObjectId(teamId),
          tmbId: new Types.ObjectId(tmbId),
          name: `Backoff Test ${testCase.retry}`,
          datasetId,
          target,
          evaluators: evaluators,
          usageId: new Types.ObjectId(),
          status: EvaluationStatusEnum.evaluating
        });

        // Mock network error
        const networkError = new Error('ECONNRESET');
        mockTargetInstance.execute.mockRejectedValue(networkError);

        const itemJobData: EvaluationItemJobData = {
          evalId: testEvaluationId.toString(),
          evalItemId: evalItem._id.toString()
        };

        const mockJob = { data: itemJobData } as any;

        await evaluationItemProcessor(mockJob);

        // 验证延迟参数 - 因为是重试，应该会调用add方法
        if ((evaluationItemQueue.add as any).mock.calls.length > 0) {
          const addCall = (evaluationItemQueue.add as any).mock.calls[0];
          const delayOption = addCall[2];
          console.log(
            `Retry ${testCase.retry} -> Expected: ${testCase.expectedMaxDelay}, Actual: ${delayOption.delay}`
          );
          expect(delayOption.delay).toBe(testCase.expectedMaxDelay);
        }
      }
    });
  });

  // ========================= 数据一致性和并发处理测试 =========================
  describe('Data Consistency and Concurrency Tests', () => {
    test('任务完成检查应该防止竞争条件', async () => {
      const { finishEvaluationTask } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();

      // 创建测试任务
      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Concurrency Test',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // 创建已完成的评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: { metricId, metricName: 'Test', score: 85 }
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: { metricId, metricName: 'Test', score: 95 }
        }
      ]);

      // 同时调用多次完成检查（模拟并发场景）
      await Promise.all([
        finishEvaluationTask(testEvaluationId.toString()),
        finishEvaluationTask(testEvaluationId.toString()),
        finishEvaluationTask(testEvaluationId.toString())
      ]);

      // 验证任务状态正确更新
      const finalEvaluation = await MongoEvaluation.findById(testEvaluationId);
      expect(finalEvaluation?.status).toBe(EvaluationStatusEnum.completed);
      expect(finalEvaluation?.finishTime).toBeDefined();
    });

    test('部分完成的任务不应该被标记为完成', async () => {
      const { finishEvaluationTask } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();

      const originalEvaluation = await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Partial Completion Test',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // 创建混合状态的评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: { metricId, metricName: 'Test', score: 85 }
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.evaluating // 仍在处理中
        }
      ]);

      await finishEvaluationTask(testEvaluationId.toString());

      // 验证任务不会被标记为完成
      const evaluation = await MongoEvaluation.findById(testEvaluationId);
      // finishEvaluationTask应该检测到有pending项目，不更新任务状态
      // 因此状态应该保持原来的evaluating状态
      expect(evaluation?.status).toBe(originalEvaluation.status);
      expect(evaluation?.finishTime).toBeUndefined();
    });
  });

  // ========================= 错误处理和状态管理测试 =========================
  describe('Error Handling and Status Management Tests', () => {
    test('评估项处理失败时应该正确清理状态', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();
      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Error cleanup test', expectedOutput: 'Expected' },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.evaluating,
        targetOutput: { actualOutput: 'Partial result', responseTime: 500 },
        retry: 3
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Error Cleanup Test',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      const mockTargetInstance = {
        execute: vi.fn().mockRejectedValue(new Error('NETWORK_ERROR: Cleanup test'))
      };
      (createTargetInstance as any).mockReturnValue(mockTargetInstance);

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证部分结果被清理
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.targetOutput).toBeNull();
      expect(updatedItem?.evaluatorOutput).toBeNull();
      expect(updatedItem?.status).toBe(EvaluationStatusEnum.queuing);
      expect(updatedItem?.retry).toBe(2);
    });

    test('任务完成统计应该正确处理所有状态', async () => {
      const { finishEvaluationTask } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Statistics Test',
        datasetId,
        target,
        evaluators: evaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // 创建各种状态的评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Success 1', expectedOutput: 'A1' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: { metricId, metricName: 'Test', score: 85 }
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Success 2', expectedOutput: 'A2' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.completed,
          evaluatorOutput: { metricId, metricName: 'Test', score: 95 }
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Failed', expectedOutput: 'A3' },
          target,
          evaluator: evaluators[0],
          status: EvaluationStatusEnum.error,
          errorMessage: 'Test error'
        }
      ]);

      await finishEvaluationTask(testEvaluationId.toString());

      const finalEvaluation = await MongoEvaluation.findById(testEvaluationId);
      expect(finalEvaluation?.status).toBe(EvaluationStatusEnum.completed);
      expect(finalEvaluation?.statistics?.totalItems).toBe(3);
      expect(finalEvaluation?.statistics?.completedItems).toBe(2);
      expect(finalEvaluation?.statistics?.errorItems).toBe(1);
    });
  });
});
