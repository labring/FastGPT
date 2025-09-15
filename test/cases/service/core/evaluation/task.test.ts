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
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { getErrText } from '@fastgpt/global/common/error/utils';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task/mq', () => ({
  evaluationTaskQueue: {
    add: vi.fn()
  },
  evaluationItemQueue: {
    add: vi.fn(),
    addBulk: vi.fn()
  },
  removeEvaluationTaskJob: vi.fn().mockResolvedValue({
    queue: 'evalTask',
    totalJobs: 0,
    removedJobs: 0,
    failedRemovals: 0,
    errors: []
  }),
  removeEvaluationItemJobs: vi.fn().mockResolvedValue({
    queue: 'evalTaskItem',
    totalJobs: 0,
    removedJobs: 0,
    failedRemovals: 0,
    errors: []
  }),
  removeEvaluationItemJobsByItemId: vi.fn().mockResolvedValue({
    queue: 'evalTaskItem',
    totalJobs: 0,
    removedJobs: 0,
    failedRemovals: 0,
    errors: []
  }),
  getEvaluationTaskWorker: vi.fn(),
  getEvaluationItemWorker: vi.fn()
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createTrainingUsage: vi.fn(),
  createEvaluationUsage: vi.fn(),
  concatUsage: vi.fn(),
  evaluationUsageIndexMap: {}
}));

// vi.mock('@fastgpt/service/common/system/log', () => ({
//   addLog: {
//     info: vi.fn(),
//     warn: vi.fn(),
//     error: vi.fn(),
//     debug: vi.fn()
//   }
// }));

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
import {
  createTrainingUsage,
  createEvaluationUsage,
  concatUsage
} from '@fastgpt/service/support/wallet/usage/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { createTargetInstance } from '@fastgpt/service/core/evaluation/target';
import { createEvaluatorInstance } from '@fastgpt/service/core/evaluation/evaluator';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';

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
        appId: '507f1f77bcf86cd799439011',
        versionId: '507f1f77bcf86cd799439012',
        chatConfig: {
          temperature: 0.7,
          maxToken: 2000
        }
      }
    };

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

    // Create evaluators array based on the metric
    evaluators = [
      {
        metric: metric.toObject(),
        runtimeConfig: {
          llm: 'gpt-3.5-turbo'
        },
        thresholdValue: 0.8
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

  beforeEach(async () => {
    vi.clearAllMocks();
    // Mock createTrainingUsage
    (createTrainingUsage as any).mockResolvedValue({ billId: new Types.ObjectId() });
    // Mock createEvaluationUsage
    (createEvaluationUsage as any).mockResolvedValue({ billId: new Types.ObjectId() });
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
            appId: '507f1f77bcf86cd799439013',
            versionId: '507f1f77bcf86cd799439014',
            chatConfig: {}
          }
        },
        evaluators: evaluators
      };

      // 添加重试机制处理MongoDB事务冲突
      let evaluation: any;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          evaluation = await EvaluationTaskService.createEvaluation({
            ...params,
            teamId: teamId,
            tmbId: tmbId
          });
          break; // 成功则退出循环
        } catch (error: any) {
          retryCount++;
          if (
            error?.message?.includes('Collection namespace') &&
            error?.message?.includes('is already in use') &&
            retryCount < maxRetries
          ) {
            // 等待一段时间后重试
            await new Promise((resolve) => setTimeout(resolve, 100 * retryCount));
            continue;
          }
          throw error; // 非命名空间冲突错误或重试次数用完，直接抛出
        }
      }

      expect(evaluation.name).toBe(params.name);
      expect(evaluation.description).toBe(params.description);
      expect(evaluation.datasetId.toString()).toBe(datasetId);
      expect(evaluation.target.type).toBe('workflow');
      expect(evaluation.target.config.appId).toBe('507f1f77bcf86cd799439013');
      expect(evaluation.target.config.versionId).toBe('507f1f77bcf86cd799439014');
      expect(evaluation.evaluators).toHaveLength(1);
      expect(evaluation.evaluators[0].metric._id.toString()).toBe(metricId);
      expect(evaluation.evaluators[0].runtimeConfig.llm).toBe('gpt-3.5-turbo');
      expect(evaluation.teamId.toString()).toBe(teamId);
      expect(evaluation.tmbId.toString()).toBe(tmbId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);
      expect(Types.ObjectId.isValid(evaluation.usageId)).toBe(true);

      // 验证创建用量记录被调用
      expect(createEvaluationUsage).toHaveBeenCalledWith({
        teamId: teamId,
        tmbId: tmbId,
        appName: params.name
      });
    });

    test('缺少必填字段时应该抛出错误', async () => {
      const invalidParams = {
        name: 'Invalid Evaluation'
        // 缺少其他必填字段
      };

      await expect(EvaluationTaskService.createEvaluation(invalidParams as any)).rejects.toThrow();
    });

    test('应该支持自动启动功能（默认值）', async () => {
      const params: CreateEvaluationParams = {
        name: 'Auto Start Test Evaluation',
        description: 'Test evaluation with auto start',
        datasetId,
        target,
        evaluators: evaluators
        // autoStart 未指定，应使用默认值 true
      };

      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 验证评估任务被创建且自动启动（状态应为 evaluating）
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);
      expect(evaluationTaskQueue.add).toHaveBeenCalledWith(`eval_task_${evaluation._id}`, {
        evalId: evaluation._id.toString()
      });
    });

    test('应该支持显式启用自动启动', async () => {
      const params: CreateEvaluationParams = {
        name: 'Explicit Auto Start Test',
        description: 'Test evaluation with explicit auto start',
        datasetId,
        target,
        evaluators: evaluators,
        autoStart: true
      };

      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 验证评估任务被创建且自动启动
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);
      expect(evaluationTaskQueue.add).toHaveBeenCalledWith(`eval_task_${evaluation._id}`, {
        evalId: evaluation._id.toString()
      });
    });

    test('应该支持关闭自动启动', async () => {
      const params: CreateEvaluationParams = {
        name: 'No Auto Start Test',
        description: 'Test evaluation without auto start',
        datasetId,
        target,
        evaluators: evaluators,
        autoStart: false
      };

      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 验证评估任务被创建但未自动启动（状态应为 queuing）
      expect(evaluation.status).toBe(EvaluationStatusEnum.queuing);
      expect(evaluationTaskQueue.add).not.toHaveBeenCalled();
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
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      const evaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);

      expect(evaluation._id.toString()).toBe(created._id.toString());
      expect(evaluation.name).toBe('Get Test Evaluation');
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);
    });

    test('评估任务不存在时应该抛出错误', async () => {
      const nonExistentId = new Types.ObjectId().toString();

      await expect(EvaluationTaskService.getEvaluation(nonExistentId, teamId)).rejects.toThrow(
        'evaluationTaskNotFound'
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
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      const updates = {
        name: 'Updated Test Evaluation',
        description: 'Updated description'
      };

      await EvaluationTaskService.updateEvaluation(created._id, updates, teamId);

      const updatedEvaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);
      expect(updatedEvaluation.name).toBe(updates.name);
      expect(updatedEvaluation.description).toBe(updates.description);
    });
  });

  describe('listEvaluations', () => {
    test('应该成功获取评估任务列表', async () => {
      // Clean up any leftover evaluation tasks
      await MongoEvaluation.deleteMany({ teamId });
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'List Test Evaluation',
        description: 'Test evaluation for list operation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

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

      const evaluation = result.list.find((e) => e._id.toString() === created._id.toString());
      expect(evaluation).toBeDefined();
      expect(evaluation?.name).toBe('List Test Evaluation');
    });

    test('应该支持搜索功能', async () => {
      // Clean up any leftover evaluation tasks
      await MongoEvaluation.deleteMany({ teamId });
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Searchable Test Evaluation',
        description: 'Test evaluation for search operation',
        datasetId,
        target,
        evaluators: evaluators
      };
      await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      const result = await EvaluationTaskService.listEvaluations(
        teamId,
        0,
        10,
        'Searchable',
        undefined,
        tmbId,
        true
      );

      expect(Array.isArray(result.list)).toBe(true);
      expect(result.list.some((evaluation) => evaluation.name.includes('Searchable'))).toBe(true);
    });

    test('应该支持按appName过滤', async () => {
      // Clean up any leftover evaluation tasks
      await MongoEvaluation.deleteMany({ teamId });

      // 创建使用不同appId的评估任务
      const targetWithAppName = {
        type: 'workflow' as const,
        config: {
          appId: '507f1f77bcf86cd799439015',
          versionId: '507f1f77bcf86cd799439016',
          chatConfig: {}
        }
      };

      const params: CreateEvaluationParams = {
        name: 'App Name Filter Test',
        description: 'Test evaluation for app name filtering',
        datasetId,
        target: targetWithAppName,
        evaluators: evaluators
      };

      await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 模拟有应用名称的情况 - 实际场景中appName会在aggregation阶段从apps collection中lookup得到
      // 这里我们测试带appName参数的调用
      const result = await EvaluationTaskService.listEvaluations(
        teamId,
        0,
        10,
        undefined,
        undefined,
        tmbId,
        true,
        'Test App Name'
      );

      expect(Array.isArray(result.list)).toBe(true);
      expect(typeof result.total).toBe('number');
    });

    test('应该支持按appId过滤', async () => {
      // Clean up any leftover evaluation tasks
      await MongoEvaluation.deleteMany({ teamId });

      const targetWithSpecificAppId = {
        type: 'workflow' as const,
        config: {
          appId: '507f1f77bcf86cd799439020',
          versionId: '507f1f77bcf86cd799439021',
          chatConfig: {}
        }
      };

      const params: CreateEvaluationParams = {
        name: 'App ID Filter Test',
        description: 'Test evaluation for app ID filtering',
        datasetId,
        target: targetWithSpecificAppId,
        evaluators: evaluators
      };

      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      const result = await EvaluationTaskService.listEvaluations(
        teamId,
        0,
        10,
        undefined,
        undefined,
        tmbId,
        true,
        undefined,
        '507f1f77bcf86cd799439020'
      );

      expect(Array.isArray(result.list)).toBe(true);
      expect(typeof result.total).toBe('number');
      // 由于过滤条件匹配，应该能找到创建的评估任务
      const foundEvaluation = result.list.find((e) => e._id.toString() === created._id.toString());
      expect(foundEvaluation).toBeDefined();
    });

    test('应该支持按versionId过滤', async () => {
      // Clean up any leftover evaluation tasks
      await MongoEvaluation.deleteMany({ teamId });

      const targetWithSpecificVersionId = {
        type: 'workflow' as const,
        config: {
          appId: '507f1f77bcf86cd799439025',
          versionId: '507f1f77bcf86cd799439026',
          chatConfig: {}
        }
      };

      const params: CreateEvaluationParams = {
        name: 'Version ID Filter Test',
        description: 'Test evaluation for version ID filtering',
        datasetId,
        target: targetWithSpecificVersionId,
        evaluators: evaluators
      };

      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      const result = await EvaluationTaskService.listEvaluations(
        teamId,
        0,
        10,
        '507f1f77bcf86cd799439026',
        undefined,
        tmbId,
        true,
        undefined,
        undefined
      );

      expect(Array.isArray(result.list)).toBe(true);
      expect(typeof result.total).toBe('number');
      // 由于过滤条件匹配，应该能找到创建的评估任务
      const foundEvaluation = result.list.find((e) => e._id.toString() === created._id.toString());
      expect(foundEvaluation).toBeDefined();
    });

    test('应该支持组合target过滤条件', async () => {
      // Clean up any leftover evaluation tasks
      await MongoEvaluation.deleteMany({ teamId });

      const targetWithMultipleFilters = {
        type: 'workflow' as const,
        config: {
          appId: '507f1f77bcf86cd799439030',
          versionId: '507f1f77bcf86cd799439031',
          chatConfig: {}
        }
      };

      const params: CreateEvaluationParams = {
        name: 'Multiple Filters Test',
        description: 'Test evaluation for multiple target filtering',
        datasetId,
        target: targetWithMultipleFilters,
        evaluators: evaluators
      };

      await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      const result = await EvaluationTaskService.listEvaluations(
        teamId,
        0,
        10,
        '507f1f77bcf86cd799439031',
        undefined,
        tmbId,
        true,
        'Test App', // appName filter
        '507f1f77bcf86cd799439030' // appId filter
      );

      expect(Array.isArray(result.list)).toBe(true);
      expect(typeof result.total).toBe('number');
    });

    test('不匹配的过滤条件应该返回空结果', async () => {
      // Clean up any leftover evaluation tasks
      await MongoEvaluation.deleteMany({ teamId });

      const params: CreateEvaluationParams = {
        name: 'No Match Test',
        description: 'Test evaluation that should not match filters',
        datasetId,
        target,
        evaluators: evaluators
      };

      await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      const result = await EvaluationTaskService.listEvaluations(
        teamId,
        0,
        10,
        undefined,
        undefined,
        tmbId,
        true,
        undefined,
        'non-existent-app-id'
      );

      expect(Array.isArray(result.list)).toBe(true);
      expect(result.total).toBe(0);
      expect(result.list.length).toBe(0);
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
        evaluators: evaluators,
        autoStart: false
      };
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      await EvaluationTaskService.startEvaluation(created._id, teamId);

      // 验证状态已更新
      const evaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);

      // 验证任务已提交到队列
      expect(evaluationTaskQueue.add).toHaveBeenCalledWith(`eval_task_${created._id}`, {
        evalId: created._id
      });
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
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 先更新状态为已完成
      await MongoEvaluation.updateOne(
        { _id: created._id },
        { $set: { status: EvaluationStatusEnum.completed } }
      );

      await expect(EvaluationTaskService.startEvaluation(created._id, teamId)).rejects.toThrow(
        'evaluationInvalidStateTransition'
      );
    });

    test('应该能重启手动停止的任务', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Restart Test Evaluation',
        description: 'Test evaluation for restart operation',
        datasetId,
        target,
        evaluators: evaluators,
        autoStart: false
      };
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 先启动任务
      await EvaluationTaskService.startEvaluation(created._id, teamId);

      // 然后停止任务
      await EvaluationTaskService.stopEvaluation(created._id, teamId);

      // 验证任务已被标记为手动停止
      let evaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.error);
      expect(evaluation.errorMessage).toBe('Manually stopped');

      // 现在应该能重启这个任务
      await EvaluationTaskService.startEvaluation(created._id, teamId);

      // 验证状态已更新
      evaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);
      expect(evaluation.errorMessage).toBeUndefined();
      expect(evaluation.finishTime).toBeUndefined();

      // 验证任务已重新提交到队列
      expect(evaluationTaskQueue.add).toHaveBeenLastCalledWith(`eval_task_${created._id}`, {
        evalId: created._id
      });
    });

    test('因真实错误失败的任务不能重启', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Error Test Evaluation',
        description: 'Test evaluation with real error',
        datasetId,
        target,
        evaluators: evaluators
      };
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 手动设置为错误状态（但不是手动停止）
      await MongoEvaluation.updateOne(
        { _id: created._id },
        {
          $set: {
            status: EvaluationStatusEnum.error,
            errorMessage: 'System error occurred',
            finishTime: new Date()
          }
        }
      );

      // 尝试重启应该失败
      await expect(EvaluationTaskService.startEvaluation(created._id, teamId)).rejects.toThrow(
        'evaluationInvalidStateTransition'
      );
    });

    test('应该支持多次重启操作', async () => {
      // 创建评估任务
      const params: CreateEvaluationParams = {
        name: 'Multiple Restart Test',
        description: 'Test multiple restart operations',
        datasetId,
        target,
        evaluators: evaluators,
        autoStart: false
      };
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 第一次：启动 -> 停止 -> 重启
      await EvaluationTaskService.startEvaluation(created._id, teamId);
      await EvaluationTaskService.stopEvaluation(created._id, teamId);
      await EvaluationTaskService.startEvaluation(created._id, teamId);

      let evaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);

      // 第二次：停止 -> 重启
      await EvaluationTaskService.stopEvaluation(created._id, teamId);
      await EvaluationTaskService.startEvaluation(created._id, teamId);

      evaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);
      expect(evaluation.errorMessage).toBeUndefined();
    });

    test('只有特定错误消息的任务才能重启', async () => {
      // 创建评估任务
      const params: CreateEvaluationParams = {
        name: 'Specific Error Message Test',
        description: 'Test specific error message for restart',
        datasetId,
        target,
        evaluators: evaluators
      };
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 测试不同的错误消息
      const errorMessages = [
        'manually stopped', // 小写，不应该允许重启
        'MANUALLY STOPPED', // 大写，不应该允许重启
        'Manually Stopped', // 不完全匹配，不应该允许重启
        'Manually stopped by user', // 包含但不完全匹配，不应该允许重启
        'System manually stopped' // 包含但不完全匹配，不应该允许重启
      ];

      for (const errorMessage of errorMessages) {
        // 设置错误状态
        await MongoEvaluation.updateOne(
          { _id: created._id },
          {
            $set: {
              status: EvaluationStatusEnum.error,
              errorMessage: errorMessage,
              finishTime: new Date()
            }
          }
        );

        // 尝试重启应该失败
        await expect(EvaluationTaskService.startEvaluation(created._id, teamId)).rejects.toThrow(
          'evaluationInvalidStateTransition'
        );
      }

      // 只有确切的 'Manually stopped' 才能重启
      await MongoEvaluation.updateOne(
        { _id: created._id },
        {
          $set: {
            status: EvaluationStatusEnum.error,
            errorMessage: 'Manually stopped',
            finishTime: new Date()
          }
        }
      );

      // 这次应该成功
      await expect(
        EvaluationTaskService.startEvaluation(created._id, teamId)
      ).resolves.not.toThrow();
    });

    test('重启时应该正确清理相关字段', async () => {
      // 创建评估任务
      const params: CreateEvaluationParams = {
        name: 'Field Cleanup Test',
        description: 'Test field cleanup during restart',
        datasetId,
        target,
        evaluators: evaluators,
        autoStart: false
      };
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 启动并停止任务
      await EvaluationTaskService.startEvaluation(created._id, teamId);
      await EvaluationTaskService.stopEvaluation(created._id, teamId);

      // 验证停止后的状态
      let evaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.error);
      expect(evaluation.errorMessage).toBe('Manually stopped');
      expect(evaluation.finishTime).toBeDefined();

      // 重启任务
      await EvaluationTaskService.startEvaluation(created._id, teamId);

      // 验证字段被正确清理
      evaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);
      expect(evaluation.errorMessage).toBeUndefined();
      expect(evaluation.finishTime).toBeUndefined();
    });

    test('重启已完成的任务应该失败', async () => {
      // 创建评估任务
      const params: CreateEvaluationParams = {
        name: 'Completed Task Restart Test',
        description: 'Test restarting completed task',
        datasetId,
        target,
        evaluators: evaluators
      };
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 手动设置为已完成状态
      await MongoEvaluation.updateOne(
        { _id: created._id },
        {
          $set: {
            status: EvaluationStatusEnum.completed,
            finishTime: new Date()
          }
        }
      );

      // 尝试重启应该失败
      await expect(EvaluationTaskService.startEvaluation(created._id, teamId)).rejects.toThrow(
        'evaluationInvalidStateTransition'
      );
    });

    test('重启正在运行的任务应该失败', async () => {
      // 创建评估任务
      const params: CreateEvaluationParams = {
        name: 'Running Task Restart Test',
        description: 'Test restarting running task',
        datasetId,
        target,
        evaluators: evaluators,
        autoStart: false
      };
      const created = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });

      // 启动任务
      await EvaluationTaskService.startEvaluation(created._id, teamId);

      // 验证状态为运行中
      const evaluation = await EvaluationTaskService.getEvaluation(created._id, teamId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);

      // 尝试再次启动应该失败
      await expect(EvaluationTaskService.startEvaluation(created._id, teamId)).rejects.toThrow(
        'evaluationInvalidStateTransition'
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
      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });
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
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.evaluating
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test 2', expectedOutput: 'Answer 2' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.queuing
        }
      ]);

      await EvaluationTaskService.stopEvaluation(testEvaluationId, teamId);

      // 验证评估任务状态
      const updatedEvaluation = await EvaluationTaskService.getEvaluation(testEvaluationId, teamId);
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
    });
  });

  describe('getEvaluationStats', () => {
    test('应该返回正确的统计信息', async () => {
      // Clean up any leftover evaluation items and evaluations
      await MongoEvalItem.deleteMany({});
      await MongoEvaluation.deleteMany({ teamId });
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for getEvaluationStats',
        description: 'A test evaluation',
        datasetId,
        target,
        evaluators: evaluators
      };
      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });
      const testEvaluationId = evaluation._id;

      // 创建测试评估项 - 确保只有最后一个有错误
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q1', expectedOutput: 'A1' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          evaluatorOutputs: [
            {
              metricName: 'Test Metric',
              data: {
                score: 85
              }
            }
          ]
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          evaluatorOutputs: [
            {
              metricName: 'Test Metric',
              data: {
                score: 95
              }
            }
          ]
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q3', expectedOutput: 'A3' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.evaluating
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q4', expectedOutput: 'A4' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.queuing
        }
      ]);

      // 单独创建错误状态的项目
      await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Q5', expectedOutput: 'A5' },
        target,
        evaluator: evaluators[0],
        status: EvaluationStatusEnum.error,
        errorMessage: 'Test error'
      });

      const stats = await EvaluationTaskService.getEvaluationStats(testEvaluationId, teamId);

      expect(stats.total).toBe(5);
      expect(stats.completed).toBe(2); // 2个真正完成的
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
      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });
      const testEvaluationId = evaluation._id;

      // 创建一些测试评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test userInput 1', expectedOutput: 'Test answer 1' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test userInput 2', expectedOutput: 'Test answer 2' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed
        }
      ]);

      const result = await EvaluationTaskService.listEvaluationItems(
        testEvaluationId,
        teamId,
        1,
        10
      );

      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.items.length).toBeGreaterThan(0);

      const item = result.items[0];
      expect(item._id).toBeDefined();
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
        const evaluation = await EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        });
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        const retrievedItem = await EvaluationTaskService.getEvaluationItem(itemId, teamId);

        expect(retrievedItem._id.toString()).toBe(itemId);
        expect(retrievedItem.evalId.toString()).toBe(testEvaluationId.toString());
        expect(retrievedItem.dataItem.userInput).toBe('Test Item');
      });

      test('评估项不存在时应该抛出错误', async () => {
        const nonExistentId = new Types.ObjectId().toString();

        await expect(
          EvaluationTaskService.getEvaluationItem(nonExistentId, teamId)
        ).rejects.toThrow('evaluationItemNotFound');
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
        const evaluation = await EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        });
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        const updates = {
          userInput: 'Updated user input',
          expectedOutput: 'Updated expected output',
          context: ['Updated context 1', 'Updated context 2']
        };

        await EvaluationTaskService.updateEvaluationItem(itemId, updates, teamId);

        const updatedItem = await EvaluationTaskService.getEvaluationItem(itemId, teamId);
        expect(updatedItem.dataItem.userInput).toBe(updates.userInput);
        expect(updatedItem.dataItem.expectedOutput).toBe(updates.expectedOutput);
        expect(updatedItem.dataItem.context).toEqual(updates.context);
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
        const evaluation = await EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        });
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.error,
          errorMessage: 'Test error',
          retry: 2
        });
        const itemId = item._id.toString();

        await EvaluationTaskService.retryEvaluationItem(itemId, teamId);

        const retriedItem = await EvaluationTaskService.getEvaluationItem(itemId, teamId);
        expect(retriedItem.status).toBe(EvaluationStatusEnum.queuing);
        expect(retriedItem.errorMessage).toBeUndefined();
        expect(retriedItem.retry).toBeGreaterThanOrEqual(1);
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
        const evaluation = await EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        });
        const testEvaluationId = evaluation._id;

        // 创建一个已完成且无错误的评估项
        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          errorMessage: null // 确保没有错误消息
        });
        const itemId = item._id.toString();

        await expect(EvaluationTaskService.retryEvaluationItem(itemId, teamId)).rejects.toThrow(
          'evaluationOnlyFailedCanRetry'
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
        const evaluation = await EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        });
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        await EvaluationTaskService.deleteEvaluationItem(itemId, teamId);

        await expect(EvaluationTaskService.getEvaluationItem(itemId, teamId)).rejects.toThrow(
          'evaluationItemNotFound'
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
        const evaluation = await EvaluationTaskService.createEvaluation({
          ...params,
          teamId: teamId,
          tmbId: tmbId
        });
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test Item', expectedOutput: 'Test Response' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          targetOutput: {
            actualOutput: 'Test response',
            responseTime: 1000
          },
          evaluatorOutputs: [
            {
              metricName: 'Test Metric',
              data: {
                score: 92,
                runLogs: { test: true }
              }
            }
          ]
        });
        const itemId = item._id.toString();

        const result = await EvaluationTaskService.getEvaluationItemResult(itemId, teamId);

        expect(result._id.toString()).toBe(itemId);
        expect(result.dataItem.userInput).toBe('Test Item');
        expect(result.targetOutput?.actualOutput).toBe('Test response');
        expect(result.evaluatorOutputs?.[0].data?.score).toBe(92);
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
      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });
      testEvaluationId = evaluation._id;

      // 创建测试数据
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'JavaScript userInput', expectedOutput: 'JS answer' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          targetOutput: {
            actualOutput: 'JavaScript is a programming language',
            responseTime: 1000
          },
          evaluatorOutputs: [
            {
              metricName: 'Test Metric',
              data: {
                score: 85
              }
            }
          ]
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Python userInput', expectedOutput: 'Python answer' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          targetOutput: {
            actualOutput: 'Python is also a programming language',
            responseTime: 1000
          },
          evaluatorOutputs: [
            {
              metricName: 'Test Metric',
              data: {
                score: 95
              }
            }
          ]
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Failed userInput', expectedOutput: 'Failed answer' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.error,
          errorMessage: 'Processing failed'
        }
      ]);
    });

    test('应该按状态搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, teamId, {
        status: EvaluationStatusEnum.completed
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    test('应该按错误状态搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, teamId, {
        hasError: true
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].dataItem.userInput).toBe('Failed userInput');
      expect(result.items[0].status).toBe(EvaluationStatusEnum.error);
    });

    test('应该按分数范围搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, teamId, {
        scoreRange: { min: 80, max: 90 }
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].evaluatorOutputs?.[0]?.data?.score).toBe(85);
    });

    test('应该按关键词搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, teamId, {
        keyword: 'JavaScript'
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].dataItem.userInput).toContain('JavaScript');
    });

    test('应该支持分页', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, teamId, {
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
      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });
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
        evaluatorOutputs: [
          {
            metricName: 'Test Metric',
            data: {
              score: 85
            }
          }
        ]
      });

      const { results: buffer } = await EvaluationTaskService.exportEvaluationResults(
        testEvaluationId,
        teamId,
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
      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });
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
        evaluatorOutputs: [
          {
            metricName: 'Test Metric',
            data: {
              score: 85
            }
          }
        ]
      });

      const { results: buffer } = await EvaluationTaskService.exportEvaluationResults(
        testEvaluationId,
        teamId,
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

      const { results: buffer } = await EvaluationTaskService.exportEvaluationResults(
        emptyEvaluation._id.toString(),
        teamId,
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
      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });
      const testEvaluationId = evaluation._id;

      // 创建失败的评估项和成功的评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Failed 1', expectedOutput: 'Answer 1' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.error,
          errorMessage: 'Error 1'
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Failed 2', expectedOutput: 'Answer 2' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.error,
          errorMessage: 'Error 2'
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Success', expectedOutput: 'Answer' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          evaluatorOutputs: [
            {
              metricName: 'Test Metric',
              data: {
                score: 90
              }
            }
          ] // 成功的项目，不应该被重试
        }
      ]);

      const retryCount = await EvaluationTaskService.retryFailedItems(testEvaluationId, teamId);

      expect(retryCount).toBe(2);

      // 验证失败的项目被重试
      const failedItems = await MongoEvalItem.find({
        evalId: testEvaluationId,
        'dataItem.userInput': { $in: ['Failed 1', 'Failed 2'] }
      });

      failedItems.forEach((item) => {
        expect(item.status).toBe(EvaluationStatusEnum.queuing);
        expect(item.errorMessage).toBeUndefined();
      });

      // 验证成功的项目未受影响
      const successItem = await MongoEvalItem.findOne({
        evalId: testEvaluationId,
        'dataItem.userInput': 'Success'
      });
      expect(successItem?.status).toBe(EvaluationStatusEnum.completed);
      expect(successItem?.evaluatorOutputs?.[0]?.data?.score).toBe(90);
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
      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });
      const testEvaluationId = evaluation._id;

      // 创建一些评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test userInput 1', expectedOutput: 'Test answer 1' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Test userInput 2', expectedOutput: 'Test answer 2' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          evaluatorOutputs: [
            {
              metricName: 'Test Metric',
              data: {
                score: 85
              }
            }
          ]
        }
      ]);

      const itemCount = await MongoEvalItem.countDocuments({ evalId: testEvaluationId });
      expect(itemCount).toBeGreaterThan(0); // 确保有评估项存在

      await EvaluationTaskService.deleteEvaluation(testEvaluationId, teamId);

      // 验证评估任务被删除
      await expect(EvaluationTaskService.getEvaluation(testEvaluationId, teamId)).rejects.toThrow(
        'evaluationTaskNotFound'
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
          metricName: 'Test Metric',
          data: {
            score: 85,
            runLogs: { usage: { totalPoints: 20 } }
          }
        })
      };

      (createTargetInstance as any).mockReturnValue(mockTargetInstance);
      (createEvaluatorInstance as any).mockResolvedValue(mockEvaluatorInstance);
    });

    test('应该正确处理评估任务流程', async () => {
      // Import the processor module after mocking
      const { evaluationTaskProcessor } = await import(
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
      const evaluation = await EvaluationTaskService.createEvaluation({
        ...params,
        teamId: teamId,
        tmbId: tmbId
      });
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
        evaluators: [evaluators[0]],
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
      expect(updatedItem?.evaluatorOutputs).toBeDefined();
      expect(updatedItem?.evaluatorOutputs?.length).toBeGreaterThan(0);

      // 验证目标和评估器被调用
      expect(mockTargetInstance.execute).toHaveBeenCalledWith({
        userInput: 'Test input',
        context: ['context1'],
        targetCallParams: undefined
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
        evaluators: [evaluators[0]],
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
      (createEvaluatorInstance as any).mockResolvedValue(mockEvaluatorInstance);
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
        expect.stringContaining(`eval_item_${evalItem._id.toString()}_retry`),
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

    test('AI积分不足应该暂停整个任务项', async () => {
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

      // 验证任务被执行完成， 任务项被暂停(error)
      const updatedEvaluation = await MongoEvaluation.findById(testEvaluationId);
      const updatedEvaluationItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedEvaluation?.status).toBe(EvaluationStatusEnum.completed);
      expect(updatedEvaluationItem?.status).toBe(EvaluationStatusEnum.error);
      expect(updatedEvaluationItem?.errorMessage).toBe(
        '[ResourceCheck] ' + getErrText(TeamErrEnum.aiPointsNotEnough)
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
          evaluators: [evaluators[0]],
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
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          evaluatorOutputs: [{ metricName: 'Test', data: { score: 85 } }]
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          evaluatorOutputs: [{ metricName: 'Test', data: { score: 95 } }]
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
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          evaluatorOutputs: [{ metricName: 'Test', data: { score: 85 } }]
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Q2', expectedOutput: 'A2' },
          target,
          evaluators: [evaluators[0]],
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

  // ========================= 聚合错误处理测试 =========================
  describe('Aggregated Error Handling Tests', () => {
    let mockTargetInstance: any;
    let mockEvaluatorInstance: any;

    beforeEach(() => {
      // Clear all mocks before each test
      vi.clearAllMocks();

      // Reset AI Points check to pass normally
      (checkTeamAIPoints as any).mockResolvedValue(undefined);

      mockTargetInstance = {
        execute: vi.fn().mockResolvedValue({
          actualOutput: 'Mock target output',
          responseTime: 1000,
          usage: [{ totalPoints: 50 }]
        })
      };
      mockEvaluatorInstance = {
        evaluate: vi.fn()
      };
      (createTargetInstance as any).mockReturnValue(mockTargetInstance);
      (createEvaluatorInstance as any).mockResolvedValue(mockEvaluatorInstance);
    });

    test('应该收集所有评估器错误并继续执行', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();

      // 创建有多个评估器的评估项
      const multipleEvaluators = [
        {
          metric: {
            _id: new Types.ObjectId(),
            name: 'Metric 1',
            type: EvalMetricTypeEnum.Custom,
            prompt: 'Test prompt 1'
          },
          runtimeConfig: { llm: 'gpt-3.5-turbo' }
        },
        {
          metric: {
            _id: new Types.ObjectId(),
            name: 'Metric 2',
            type: EvalMetricTypeEnum.Custom,
            prompt: 'Test prompt 2'
          },
          runtimeConfig: { llm: 'gpt-3.5-turbo' }
        },
        {
          metric: {
            _id: new Types.ObjectId(),
            name: 'Metric 3',
            type: EvalMetricTypeEnum.Custom,
            prompt: 'Test prompt 3'
          },
          runtimeConfig: { llm: 'gpt-3.5-turbo' }
        }
      ];

      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Test input', expectedOutput: 'Expected output' },
        target,
        evaluators: multipleEvaluators,
        status: EvaluationStatusEnum.queuing,
        retry: 3
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Aggregated Error Test',
        datasetId,
        target,
        evaluators: multipleEvaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // Mock evaluators - 第一个成功，第二个和第三个失败（使用明确不可重试的错误）
      mockEvaluatorInstance.evaluate
        .mockResolvedValueOnce({
          metricName: 'Metric 1',
          status: 'success',
          data: { score: 85 },
          totalPoints: 20
        })
        .mockResolvedValueOnce({
          metricName: 'Metric 2',
          status: 'failed',
          error: 'AUTHENTICATION_FAILED: Invalid API key provided.',
          totalPoints: 15
        })
        .mockResolvedValueOnce({
          metricName: 'Metric 3',
          status: 'failed',
          error: 'VALIDATION_ERROR: Input validation failed.',
          totalPoints: 10
        });

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证评估项被标记为错误状态
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.status).toBe(EvaluationStatusEnum.error);

      // 验证错误消息包含所有失败的评估器信息
      expect(updatedItem?.errorMessage).toContain('[EvaluatorExecute]');
      expect(updatedItem?.errorMessage).toContain(
        'Metric 2: AUTHENTICATION_FAILED: Invalid API key provided.'
      );
      expect(updatedItem?.errorMessage).toContain(
        'Metric 3: VALIDATION_ERROR: Input validation failed.'
      );

      // 验证所有评估器的用量都被记录
      expect(concatUsage).toHaveBeenCalled();

      // 验证所有三个评估器都被调用
      expect(mockEvaluatorInstance.evaluate).toHaveBeenCalledTimes(3);
    });

    test('应该正确处理部分评估器失败的聚合错误可重试性', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();

      const multipleEvaluators = [
        {
          metric: {
            _id: new Types.ObjectId(),
            name: 'Metric 1',
            type: EvalMetricTypeEnum.Custom
          },
          runtimeConfig: { llm: 'gpt-3.5-turbo' }
        },
        {
          metric: {
            _id: new Types.ObjectId(),
            name: 'Metric 2',
            type: EvalMetricTypeEnum.Custom
          },
          runtimeConfig: { llm: 'gpt-3.5-turbo' }
        }
      ];

      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Test input', expectedOutput: 'Expected output' },
        target,
        evaluators: multipleEvaluators,
        status: EvaluationStatusEnum.queuing,
        retry: 3
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Retry Aggregated Error Test',
        datasetId,
        target,
        evaluators: multipleEvaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // Mock evaluators - 一个可重试错误，一个不可重试错误
      mockEvaluatorInstance.evaluate
        .mockResolvedValueOnce({
          metricName: 'Metric 1',
          status: 'failed',
          error: 'TIMEOUT: Request timeout', // 可重试
          totalPoints: 20
        })
        .mockResolvedValueOnce({
          metricName: 'Metric 2',
          status: 'failed',
          error: 'INVALID_CONFIG: Configuration error', // 不可重试
          totalPoints: 15
        });

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证评估项被重新排队（因为有可重试错误）
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.status).toBe(EvaluationStatusEnum.queuing);
      expect(updatedItem?.retry).toBe(2);

      // 验证重新排队的调用
      expect(evaluationItemQueue.add).toHaveBeenCalledWith(
        expect.stringContaining(`eval_item_${evalItem._id.toString()}_retry`),
        {
          evalId: testEvaluationId.toString(),
          evalItemId: evalItem._id.toString()
        },
        expect.objectContaining({
          delay: expect.any(Number)
        })
      );
    });

    test('应该正确处理所有评估器都成功的情况', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();

      const multipleEvaluators = [
        {
          metric: {
            _id: new Types.ObjectId(),
            name: 'Metric 1',
            type: EvalMetricTypeEnum.Custom
          },
          runtimeConfig: { llm: 'gpt-3.5-turbo' }
        },
        {
          metric: {
            _id: new Types.ObjectId(),
            name: 'Metric 2',
            type: EvalMetricTypeEnum.Custom
          },
          runtimeConfig: { llm: 'gpt-3.5-turbo' }
        }
      ];

      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Test input', expectedOutput: 'Expected output' },
        target,
        evaluators: multipleEvaluators,
        status: EvaluationStatusEnum.queuing,
        retry: 3
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'All Success Test',
        datasetId,
        target,
        evaluators: multipleEvaluators,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // Mock evaluators - 都成功
      mockEvaluatorInstance.evaluate
        .mockResolvedValueOnce({
          metricName: 'Metric 1',
          status: 'success',
          data: { score: 85 },
          totalPoints: 20
        })
        .mockResolvedValueOnce({
          metricName: 'Metric 2',
          status: 'success',
          data: { score: 90 },
          totalPoints: 15
        });

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证评估项被标记为完成
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.status).toBe(EvaluationStatusEnum.completed);
      expect(updatedItem?.evaluatorOutputs).toHaveLength(2);
      expect(updatedItem?.evaluatorOutputs?.[0].data?.score).toBe(85);
      expect(updatedItem?.evaluatorOutputs?.[1].data?.score).toBe(90);

      // 验证用量记录
      expect(concatUsage).toHaveBeenCalled();
    });

    test('应该在评估器抛出异常时正确处理', async () => {
      const { evaluationItemProcessor } = await import(
        '@fastgpt/service/core/evaluation/task/processor'
      );

      const testEvaluationId = new Types.ObjectId();

      const singleEvaluator = [
        {
          metric: {
            _id: new Types.ObjectId(),
            name: 'Exception Metric',
            type: EvalMetricTypeEnum.Custom
          },
          runtimeConfig: { llm: 'gpt-3.5-turbo' }
        }
      ];

      const evalItem = await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { userInput: 'Test input', expectedOutput: 'Expected output' },
        target,
        evaluators: singleEvaluator,
        status: EvaluationStatusEnum.queuing,
        retry: 3
      });

      await MongoEvaluation.create({
        _id: testEvaluationId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Exception Test',
        datasetId,
        target,
        evaluators: singleEvaluator,
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.evaluating
      });

      // Mock evaluator抛出异常
      mockEvaluatorInstance.evaluate.mockRejectedValue(
        new Error('NETWORK_ERROR: Connection failed')
      );

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证评估项被重新排队（异常应该被当作可重试错误处理）
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
      expect(updatedItem?.status).toBe(EvaluationStatusEnum.queuing);
      expect(updatedItem?.retry).toBe(2);
      expect(updatedItem?.errorMessage).toContain('[EvaluatorExecute]');
      expect(updatedItem?.errorMessage).toContain('NETWORK_ERROR');
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
        _id: '6666666c506834bfaa7a3a0d',
        evalId: testEvaluationId,
        dataItem: { userInput: 'Error cleanup test', expectedOutput: 'Expected' },
        target,
        evaluators: [evaluators[0]],
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

      // Reset AI Points check to pass normally
      (checkTeamAIPoints as any).mockResolvedValue(undefined);

      const mockTargetInstance = {
        execute: vi.fn().mockRejectedValue(new Error('NETWORK_ERROR: Cleanup test'))
      };
      (createTargetInstance as any).mockReturnValue(mockTargetInstance);

      const mockEvaluatorInstance = {
        evaluate: vi.fn().mockRejectedValue(new Error('NETWORK_ERROR: Cleanup test'))
      };
      (createEvaluatorInstance as any).mockResolvedValue(mockEvaluatorInstance);

      const itemJobData: EvaluationItemJobData = {
        evalId: testEvaluationId.toString(),
        evalItemId: evalItem._id.toString()
      };

      const mockJob = { data: itemJobData } as any;

      await evaluationItemProcessor(mockJob);

      // 验证部分结果被清理
      const updatedItem = await MongoEvalItem.findById(evalItem._id);
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
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          evaluatorOutputs: [{ metricName: 'Test', data: { score: 85 } }]
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Success 2', expectedOutput: 'A2' },
          target,
          evaluators: [evaluators[0]],
          status: EvaluationStatusEnum.completed,
          evaluatorOutputs: [{ metricName: 'Test', data: { score: 95 } }]
        },
        {
          evalId: testEvaluationId,
          dataItem: { userInput: 'Failed', expectedOutput: 'A3' },
          target,
          evaluators: [evaluators[0]],
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
