import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createRerankTrainTask,
  updateRerankTaskStatus,
  updateRerankCheckpointStage,
  updateRerankCheckpointData,
  getRerankTrainTask,
  deleteRerankTrainTask,
  cancelRerankTrainTask,
  resolveRerankTasksByTunedModelId
} from '@fastgpt/service/core/train/rerank/task/controller';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { createMockDoc } from './mockDoc';

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

vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
    deleteOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({
  deleteSFTTask: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoSystemModel: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/validation', () => ({
  validateTrainingEnvironment: vi.fn().mockResolvedValue(undefined),
  validateDatasetSynthesisIndexes: vi.fn().mockResolvedValue(undefined)
}));

describe('Rerank Train Task Controller', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: MongoSystemModel.findOne returns null (model not in DB = original model, not disabled)
    const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
    (MongoSystemModel.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });

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
      (MongoRerankTrainTask.create as any).mockResolvedValue([createMockDoc({ _id: 'task_123' })]);

      const task = await createRerankTrainTask({
        baseModelId: 'model_123',
        trainsetId: 'trainset_123',
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'My Task'
      });

      expect(String(task._id)).toBe('task_123');

      // Verify the task was created with the correct model config
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
      (MongoRerankTrainTask.create as any).mockResolvedValue([createMockDoc({ _id: 'task_auto' })]);

      const task = await createRerankTrainTask({
        baseModelId: 'model_123',
        datasetIds: ['ds1', 'ds2'],
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      expect(String(task._id)).toBe('task_auto');
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
      ).rejects.toBe('rerankTaskModelNotFound');
    });

    test('基础模型已禁用时应拒绝创建', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');

      (MongoSystemModel.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ metadata: { isActive: false } })
      });

      await expect(
        createRerankTrainTask({
          baseModelId: 'model_123',
          teamId: 'team_123',
          tmbId: 'tmb_123'
        })
      ).rejects.toBe('rerankTaskBaseModelDisabled');
    });
  });

  describe('updateTaskStatus', () => {
    test('应该成功更新任务状态', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateRerankTaskStatus('task_123', RerankTrainTaskStatusEnum.running);

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

      await updateRerankTaskStatus('task_123', RerankTrainTaskStatusEnum.completed);

      const callArgs = (MongoRerankTrainTask.updateOne as any).mock.calls[0][1];
      expect(callArgs.finishTime).toBeDefined();
    });
  });

  describe('updateRerankCheckpointStage', () => {
    test('应该成功更新检查点阶段', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateRerankCheckpointStage(
        'task_123',
        RerankTaskCheckpointStageEnum.generate_trainset
      );

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          'checkpoint.stage': RerankTaskCheckpointStageEnum.generate_trainset
        })
      );
    });
  });

  describe('updateRerankCheckpointData', () => {
    test('整体更新模式应替换整个阶段数据', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateRerankCheckpointData(
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

      await updateRerankCheckpointData(
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
    test('应该成功删除训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_123',
          baseModelId: 'model_123',
          datasetIds: [],
          result: { trainDatasetFilePath: undefined }
        })
      });

      (MongoRerankTrainTask.deleteOne as any).mockResolvedValue({});

      await deleteRerankTrainTask('task_123');

      expect(MongoRerankTrainTask.findById).toHaveBeenCalledWith('task_123', null, {
        session: undefined
      });
      expect(MongoRerankTrainTask.deleteOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        { session: undefined }
      );
    });

    test('精确模式（用户传入 trainsetId，无 datasetIds）：不应删除用户的 trainset', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      // Exact mode: trainsetId provided at creation, generate_trainset stage did NOT set autoGenerated
      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_exact',
          baseModelId: 'model_123',
          trainsetId: 'user_trainset_id',
          datasetIds: [],
          checkpoint: {
            stage: RerankTaskCheckpointStageEnum.generate_trainset,
            data: {
              generate_trainset: {
                trainDatasetId: 'user_trainset_id',
                trainDatasetFilePath: '/tmp/data.jsonl',
                autoGenerated: false // exact mode: stage does not auto-generate
              }
            }
          },
          result: {}
        })
      });
      (MongoRerankTrainTask.deleteOne as any).mockResolvedValue({});

      await deleteRerankTrainTask('task_exact');

      // Must NOT delete user's trainset
      expect(MongoRerankTrainset.deleteOne).not.toHaveBeenCalled();
      expect(MongoRerankTrainsetData.deleteMany).not.toHaveBeenCalled();
      // Task itself is deleted
      expect(MongoRerankTrainTask.deleteOne).toHaveBeenCalledWith(
        { _id: 'task_exact' },
        { session: undefined }
      );
    });

    test('自动模式（有 datasetIds，trainsetId 由 generate_trainset 阶段回写）：应删除自动生成的 trainset', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      // Auto mode: generate_trainset stage set autoGenerated=true
      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_auto',
          baseModelId: 'model_123',
          trainsetId: 'auto_trainset_id',
          datasetIds: ['ds_1', 'ds_2'],
          checkpoint: {
            stage: RerankTaskCheckpointStageEnum.generate_trainset,
            data: {
              generate_trainset: {
                trainDatasetId: 'auto_trainset_id',
                trainDatasetFilePath: '/tmp/data.jsonl',
                autoGenerated: true // auto mode: stage created the trainset
              }
            }
          },
          result: {}
        })
      });
      (MongoEvalDatasetCollection.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });
      (MongoRerankTrainTask.deleteOne as any).mockResolvedValue({});
      (MongoEvalDatasetData.deleteMany as any).mockResolvedValue({});
      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 5 });
      (MongoRerankTrainset.deleteOne as any).mockResolvedValue({});

      await deleteRerankTrainTask('task_auto');

      // Should delete auto-generated trainset and its data
      expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalledWith(
        { trainsetId: 'auto_trainset_id' },
        { session: undefined }
      );
      expect(MongoRerankTrainset.deleteOne).toHaveBeenCalledWith(
        { _id: 'auto_trainset_id' },
        { session: undefined }
      );
    });

    test('精确模式（有用户传入的 evalDatasetId）：不查询也不删除 eval dataset collection', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );

      // Exact mode: evalDatasetId provided at creation, generate_evaldataset stage set autoGenerated=false
      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_eval_exact',
          baseModelId: 'model_123',
          evalDatasetId: 'user_eval_dataset_id',
          datasetIds: [],
          checkpoint: {
            stage: RerankTaskCheckpointStageEnum.generate_evaldataset,
            data: {
              generate_evaldataset: {
                evalDatasetId: 'user_eval_dataset_id',
                autoGenerated: false // exact mode: stage did not auto-generate
              }
            }
          },
          result: {}
        })
      });
      (MongoRerankTrainTask.deleteOne as any).mockResolvedValue({});
      (MongoEvalDatasetData.deleteMany as any).mockResolvedValue({});

      await deleteRerankTrainTask('task_eval_exact');

      // In exact mode (autoGenerated=false), eval dataset cleanup is skipped entirely
      expect(MongoEvalDatasetCollection.find).not.toHaveBeenCalled();
      expect(MongoEvalDatasetData.deleteMany).not.toHaveBeenCalled();
    });

    test('混合模式（同时传入 trainsetId + evalDatasetId + datasetIds）：精确模式执行时不误删用户数据', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );

      // Mixed mode: user passed trainsetId + evalDatasetId + datasetIds
      // generate_trainset and generate_evaldataset ran in exact mode → autoGenerated=false
      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_mixed',
          baseModelId: 'model_123',
          trainsetId: 'user_trainset_id',
          evalDatasetId: 'user_eval_dataset_id',
          datasetIds: ['ds_1', 'ds_2'], // present but stages ran in exact mode
          checkpoint: {
            stage: RerankTaskCheckpointStageEnum.generate_evaldataset,
            data: {
              generate_trainset: {
                trainDatasetId: 'user_trainset_id',
                trainDatasetFilePath: '/tmp/data.jsonl',
                autoGenerated: false // exact mode: user's trainset was used, nothing auto-created
              },
              generate_evaldataset: {
                evalDatasetId: 'user_eval_dataset_id',
                autoGenerated: false // exact mode: user's eval dataset was used, nothing auto-created
              }
            }
          },
          result: {}
        })
      });
      (MongoRerankTrainTask.deleteOne as any).mockResolvedValue({});

      await deleteRerankTrainTask('task_mixed');

      // Must NOT delete user's trainset or eval dataset
      expect(MongoRerankTrainset.deleteOne).not.toHaveBeenCalled();
      expect(MongoRerankTrainsetData.deleteMany).not.toHaveBeenCalled();
      expect(MongoEvalDatasetCollection.find).not.toHaveBeenCalled();
      expect(MongoEvalDatasetData.deleteMany).not.toHaveBeenCalled();
      // Task itself is deleted
      expect(MongoRerankTrainTask.deleteOne).toHaveBeenCalledWith(
        { _id: 'task_mixed' },
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

      await expect(cancelRerankTrainTask('non_existent')).rejects.toBe('rerankTaskNotExist');
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

      await expect(cancelRerankTrainTask('task_123')).rejects.toBe('rerankTaskCannotCancel');
    });
  });

  describe('createRerankTrainTask - rerankTaskAlreadyRunning', () => {
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
      ).rejects.toBe('rerankTaskAlreadyRunning');

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
      (MongoRerankTrainTask.create as any).mockResolvedValue([createMockDoc({ _id: 'new_task' })]);

      const task = await createRerankTrainTask({
        baseModelId: 'model_123',
        datasetIds: ['ds1'],
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      expect(String(task._id)).toBe('new_task');
    });
  });

  describe('resolveRerankTasksByTunedModelId', () => {
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

      const tasks = await resolveRerankTasksByTunedModelId('model_v2', 'team_123');

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

      const tasks = await resolveRerankTasksByTunedModelId('model_unknown', 'team_123');

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

      const tasks = await resolveRerankTasksByTunedModelId('model_a', 'team_123');

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
