import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createRerankTrainTask,
  updateTaskStatus,
  updateCheckpointStage,
  updateCheckpointData,
  getRerankTrainTask,
  deleteRerankTrainTask,
  cancelRerankTrainTask,
  resolveTasksByTunedModelId
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
    test('应该成功创建训练任务（通过 baseModelId）', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null) // no running task
      });
      (MongoRerankTrainTask.create as any).mockResolvedValue([{ _id: 'task_123' }]);

      const taskId = await createRerankTrainTask({
        baseModelId: 'model_123',
        trainsetId: 'trainset_123',
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'My Task'
      });

      expect(taskId).toBe('task_123');

      // Verify the task was created with the correct model config (baseModelId instead of appId)
      expect(MongoRerankTrainTask.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            trainsetId: 'trainset_123',
            teamId: 'team_123',
            tmbId: 'tmb_123',
            name: 'My Task',
            baseModelId: 'model_123',
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

    test('支持 datasetIds 自动模式（无 trainsetId）', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null) // no running task
      });
      (MongoRerankTrainTask.create as any).mockResolvedValue([{ _id: 'task_auto' }]);

      const taskId = await createRerankTrainTask({
        baseModelId: 'model_123',
        datasetIds: ['ds1', 'ds2'],
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      expect(taskId).toBe('task_auto');
      expect(MongoRerankTrainTask.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            baseModelId: 'model_123',
            datasetIds: ['ds1', 'ds2']
          })
        ])
      );
    });

    test('模型不存在时应抛出错误', async () => {
      await expect(
        createRerankTrainTask({
          baseModelId: 'non_existent_model',
          teamId: 'team_123',
          tmbId: 'tmb_123'
        })
      ).rejects.toBe('taskModelNotFound');
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

      await updateCheckpointStage('task_123', RerankTaskCheckpointStageEnum.generate_trainset);

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          'checkpoint.stage': RerankTaskCheckpointStageEnum.generate_trainset
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
        RerankTaskCheckpointStageEnum.generate_trainset,
        {
          trainDatasetId: 'data1',
          trainDatasetFilePath: '/tmp/data.jsonl'
        },
        false
      );

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          [`checkpoint.data.${RerankTaskCheckpointStageEnum.generate_trainset}`]: {
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
        RerankTaskCheckpointStageEnum.generate_evaldataset,
        { evalDatasetId: 'eval_123' },
        true
      );

      const callArgs = (MongoRerankTrainTask.updateOne as any).mock.calls[0][1];
      expect(
        callArgs[
          `checkpoint.data.${RerankTaskCheckpointStageEnum.generate_evaldataset}.evalDatasetId`
        ]
      ).toBe('eval_123');
    });
  });

  describe('getRerankTrainTask', () => {
    test('应该成功获取训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      const mockTask = {
        _id: 'task_123',
        baseModelId: 'model_123',
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
    test('应该成功删除训练任务（无 App 版本回滚）', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_123',
          baseModelId: 'model_123',
          result: { trainDatasetFilePath: undefined }
        })
      });

      (MongoEvalDatasetCollection.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
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

  describe('createRerankTrainTask - taskAlreadyRunning', () => {
    test('同一 baseModelId 已有进行中任务时应拒绝创建', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'existing_task', status: 'running' })
      });

      await expect(
        createRerankTrainTask({
          baseModelId: 'model_123',
          datasetIds: ['ds1'],
          teamId: 'team_123',
          tmbId: 'tmb_123'
        })
      ).rejects.toBe('taskAlreadyRunning');

      expect(MongoRerankTrainTask.create).not.toHaveBeenCalled();
    });

    test('无进行中任务时应正常创建', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      // no running task
      (MongoRerankTrainTask.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });
      (MongoRerankTrainTask.create as any).mockResolvedValue([{ _id: 'new_task' }]);

      const taskId = await createRerankTrainTask({
        baseModelId: 'model_123',
        datasetIds: ['ds1'],
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      expect(taskId).toBe('new_task');
    });
  });

  describe('resolveTasksByTunedModelId', () => {
    test('正常链式溯源：按 tunedModelId 逐级向上追溯', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      // task_v2 has tunedModelId = model_v2, baseModelId = model_v1
      // task_v1 has tunedModelId = model_v1, baseModelId = model_base (not a tuned model, so no further tasks found)
      (MongoRerankTrainTask.findOne as any)
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue({ _id: 'task_v2', baseModelId: 'model_v1' })
        })
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue({ _id: 'task_v1', baseModelId: 'model_base' })
        })
        .mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const tasks = await resolveTasksByTunedModelId('model_v2', 'team_123');

      expect(tasks).toHaveLength(2);
      expect(tasks[0]._id).toBe('task_v2');
      expect(tasks[1]._id).toBe('task_v1');
    });

    test('无匹配任务时返回空数组', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const tasks = await resolveTasksByTunedModelId('model_unknown', 'team_123');

      expect(tasks).toHaveLength(0);
    });

    test('环路检测：baseModelId 形成环路时应安全终止', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { addLog } = await import('@fastgpt/service/common/system/log');

      // model_a → task_a (baseModelId = model_b) → task_b (baseModelId = model_a, forming a cycle)
      (MongoRerankTrainTask.findOne as any)
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue({ _id: 'task_a', baseModelId: 'model_b' })
        })
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue({ _id: 'task_b', baseModelId: 'model_a' })
        });

      const tasks = await resolveTasksByTunedModelId('model_a', 'team_123');

      // should return collected tasks without infinite looping
      expect(tasks.length).toBeLessThanOrEqual(2);
      // should trigger a cycle warning log
      expect(addLog.warn).toHaveBeenCalledWith(
        'Cycle detected in task chain traversal',
        expect.objectContaining({ tunedModelId: 'model_a' })
      );
    });
  });
});
