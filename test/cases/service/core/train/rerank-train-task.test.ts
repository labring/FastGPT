import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createRerankTrainTask,
  updateTaskStatus,
  updateCheckpointStage,
  updateCheckpointData,
  getRerankTrainTask,
  deleteRerankTrainTask,
  cancelRerankTrainTask
} from '@fastgpt/service/core/train/rerank/task/controller';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/task/schema', () => ({
  MongoRerankTrainTask: {
    create: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  AppCollectionName: 'apps'
}));

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    findOne: vi.fn(),
    findById: vi.fn(),
    deleteOne: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    find: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/model/controller', () => ({
  deleteRerankModelConfig: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/rerank/validation', () => ({
  validateTrainingEnvironment: vi.fn().mockResolvedValue(undefined),
  validateDatasetSynthesisIndexes: vi.fn().mockResolvedValue(undefined)
}));

describe('Rerank Train Task Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock global.reRankModelMap
    (global as any).reRankModelMap = new Map([
      [
        'model_123',
        {
          model: 'bge-reranker-v2-m3',
          name: 'BGE Reranker v2-m3',
          provider: 'openai',
          type: 'rerank',
          requestUrl: 'http://localhost:8080/v1',
          requestAuth: 'test-api-key'
        }
      ]
    ]);
  });

  describe('createRerankTrainTask', () => {
    test('应该成功创建训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      // Mock app with dataset search node containing rerank model
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'app_123',
          name: 'Test App',
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                {
                  key: 'rerankModel',
                  value: 'model_123'
                }
              ]
            }
          ]
        })
      });

      // Mock create task
      (MongoRerankTrainTask.create as any).mockResolvedValue([{ _id: 'task_123' }]);

      const taskId = await createRerankTrainTask({
        appId: 'app_123',
        trainsetId: 'trainset_123',
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'My Task'
      });

      expect(taskId).toBe('task_123');
      expect(MongoApp.findById).toHaveBeenCalledWith('app_123');

      // 验证创建任务时使用了正确的模型配置
      expect(MongoRerankTrainTask.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            appId: 'app_123',
            trainsetId: 'trainset_123',
            teamId: 'team_123',
            tmbId: 'tmb_123',
            name: 'My Task',
            baseModelConfigId: 'model_123',
            baseModelEndpoint: expect.objectContaining({
              base_url: 'http://localhost:8080/v1',
              model: 'bge-reranker-v2-m3',
              api_key: 'test-api-key'
            }),
            status: RerankTrainTaskStatusEnum.pending
          })
        ])
      );
    });

    test('应用不存在时应抛出错误', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        createRerankTrainTask({
          appId: 'non_existent_app',
          trainsetId: 'trainset_123',
          teamId: 'team_123',
          tmbId: 'tmb_123'
        })
      ).rejects.toThrow('Application not found');
    });

    test('应用无 rerank 节点时应抛出错误', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'app_123',
          modules: [{ flowNodeType: 'otherNode' }]
        })
      });

      await expect(
        createRerankTrainTask({
          appId: 'app_123',
          trainsetId: 'trainset_123',
          teamId: 'team_123',
          tmbId: 'tmb_123'
        })
      ).rejects.toThrow('No default model available in system');
    });
  });

  describe('updateTaskStatus', () => {
    test('应该成功更新任务状态', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateTaskStatus('task_123', RerankTrainTaskStatusEnum.running);

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          status: RerankTrainTaskStatusEnum.running
        })
      );
    });

    test('完成状态应设置 finishTime', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateTaskStatus('task_123', RerankTrainTaskStatusEnum.completed);

      const callArgs = (MongoRerankTrainTask.updateOne as any).mock.calls[0][1];
      expect(callArgs.finishTime).toBeDefined();
    });
  });

  describe('updateCheckpointStage', () => {
    test('应该成功更新检查点阶段', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateCheckpointStage('task_123', RerankTaskCheckpointStageEnum.preparing);

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          'checkpoint.stage': RerankTaskCheckpointStageEnum.preparing
        })
      );
    });
  });

  describe('updateCheckpointData', () => {
    test('整体更新模式应替换整个阶段数据', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateCheckpointData(
        'task_123',
        'preparing',
        {
          trainDatasetId: 'data1',
          trainDatasetFilePath: '/tmp/data.jsonl'
        },
        false
      );

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          'checkpoint.data.preparing': {
            trainDatasetId: 'data1',
            trainDatasetFilePath: '/tmp/data.jsonl'
          }
        })
      );
    });

    test('部分更新模式应只更新指定字段', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateCheckpointData(
        'task_123',
        'evaluating',
        {
          evalDatasetId: 'eval_123'
        },
        true
      );

      const callArgs = (MongoRerankTrainTask.updateOne as any).mock.calls[0][1];
      expect(callArgs['checkpoint.data.evaluating.evalDatasetId']).toBe('eval_123');
    });
  });

  describe('getRerankTrainTask', () => {
    test('应该成功获取训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      const mockTask = {
        _id: 'task_123',
        appId: 'app_123',
        status: RerankTrainTaskStatusEnum.pending
      };

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTask)
      });

      const task = await getRerankTrainTask('task_123');

      expect(task).toEqual(mockTask);
      expect(MongoRerankTrainTask.findById).toHaveBeenCalledWith('task_123');
    });

    test('任务不存在时应返回 null', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const task = await getRerankTrainTask('non_existent');

      expect(task).toBeNull();
    });
  });

  describe('deleteRerankTrainTask', () => {
    test('应该成功删除训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      const { MongoAppVersion } = await import('@fastgpt/service/core/app/version/schema');

      // Mock findById to return a task for deletion
      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_123',
          appId: 'app_123',
          result: { trainDatasetFilePath: undefined }
        })
      });

      // Mock eval dataset collection find to return empty array
      (MongoEvalDatasetCollection.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      // Mock app version queries
      (MongoAppVersion.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      (MongoRerankTrainTask.deleteOne as any).mockResolvedValue({});
      (MongoEvalDatasetData.deleteMany as any).mockResolvedValue({});

      await deleteRerankTrainTask('task_123');

      expect(MongoRerankTrainTask.findById).toHaveBeenCalledWith('task_123', null, {
        session: undefined
      });
      expect(MongoRerankTrainTask.deleteOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        { session: undefined }
      );
    });
  });

  describe('cancelRerankTrainTask', () => {
    test('应该成功取消进行中的任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_123',
          status: RerankTrainTaskStatusEnum.running
        })
      });

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await cancelRerankTrainTask('task_123');

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          status: RerankTrainTaskStatusEnum.cancelled
        })
      );
    });

    test('任务不存在时应抛出错误', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(cancelRerankTrainTask('non_existent')).rejects.toThrow('Task not found');
    });

    test('已完成的任务不能取消', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_123',
          status: RerankTrainTaskStatusEnum.completed
        })
      });

      await expect(cancelRerankTrainTask('task_123')).rejects.toThrow(
        'Cannot cancel a task that is already finished'
      );
    });
  });
});
