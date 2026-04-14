import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createEmbeddingTrainTask,
  updateEmbeddingTaskStatus,
  updateEmbeddingCheckpointStage,
  updateEmbeddingCheckpointData,
  getEmbeddingTrainTask,
  deleteEmbeddingTrainTask,
  cancelEmbeddingTrainTask
} from '@fastgpt/service/core/train/embedding/task/controller';
import {
  EmbeddingTrainTaskStatusEnum,
  EmbeddingTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/embedding/constants';
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

vi.mock('@fastgpt/service/core/train/embedding/task/schema', () => ({
  MongoEmbeddingTrainTask: {
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

vi.mock('@fastgpt/service/core/train/embedding/model/controller', () => ({
  deleteEmbeddingModelConfig: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/embedding/trainset/schema', () => ({
  MongoEmbeddingTrainset: {
    deleteOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/embedding/data/schema', () => ({
  MongoEmbeddingTrainsetData: {
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/embedding/external', () => ({
  deleteSFTTask: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoSystemModel: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModel: vi.fn()
}));

describe('Embedding Train Task Controller', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: MongoSystemModel.findOne returns null (model not in DB = original model)
    const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
    (MongoSystemModel.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });

    // Mock getEmbeddingModel
    const { getEmbeddingModel } = await import('@fastgpt/service/core/ai/model');
    (getEmbeddingModel as any).mockReturnValue({
      model: 'bge-large-zh',
      name: 'BGE Large ZH',
      provider: 'openai',
      type: 'embedding',
      requestUrl: 'http://localhost:8080/v1',
      requestAuth: 'test-api-key'
    });
  });

  describe('createEmbeddingTrainTask', () => {
    test('应该成功创建训练任务（通过 baseModelId）', async () => {
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      (MongoEmbeddingTrainTask.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null) // no running task
      });
      (MongoEmbeddingTrainTask.create as any).mockResolvedValue([
        createMockDoc({ _id: 'task_123' })
      ]);

      const task = await createEmbeddingTrainTask({
        baseModelId: 'model_123',
        trainsetId: 'trainset_123',
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'My Task'
      });

      expect(String(task._id)).toBe('task_123');

      // Verify the task was created with the correct model config
      expect(MongoEmbeddingTrainTask.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            trainsetId: 'trainset_123',
            teamId: 'team_123',
            tmbId: 'tmb_123',
            name: 'My Task',
            baseModelId: 'model_123',
            baseModelEndpoint: expect.objectContaining({
              base_url: 'http://localhost:8080/v1',
              model: 'bge-large-zh',
              api_key: 'test-api-key'
            }),
            status: EmbeddingTrainTaskStatusEnum.pending
          })
        ])
      );
    });

    test('支持 datasetIds 自动模式（无 trainsetId）', async () => {
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      (MongoEmbeddingTrainTask.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });
      (MongoEmbeddingTrainTask.create as any).mockResolvedValue([
        createMockDoc({ _id: 'task_456' })
      ]);

      const task = await createEmbeddingTrainTask({
        baseModelId: 'model_123',
        datasetIds: ['dataset_1', 'dataset_2'],
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      expect(String(task._id)).toBe('task_456');
      expect(MongoEmbeddingTrainTask.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            datasetIds: ['dataset_1', 'dataset_2'],
            trainsetId: undefined,
            status: EmbeddingTrainTaskStatusEnum.pending
          })
        ])
      );
    });
  });

  describe('getEmbeddingTrainTask', () => {
    test('应该按 ID 获取任务', async () => {
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      const mockTask = {
        _id: 'task_123',
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'Test Task',
        baseModelId: 'model_123',
        status: EmbeddingTrainTaskStatusEnum.pending
      };

      (MongoEmbeddingTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTask)
      });

      const task = await getEmbeddingTrainTask('task_123');

      expect(task).toEqual(mockTask);
    });
  });

  describe('deleteEmbeddingTrainTask', () => {
    test('应该成功删除任务', async () => {
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      (MongoEmbeddingTrainTask.deleteOne as any).mockResolvedValue({ deletedCount: 1 });

      await deleteEmbeddingTrainTask('task_123');

      expect(MongoEmbeddingTrainTask.deleteOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        { session: undefined }
      );
    });
  });

  describe('cancelEmbeddingTrainTask', () => {
    test('应该取消待处理任务', async () => {
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      (MongoEmbeddingTrainTask.updateOne as any).mockResolvedValue({ modifiedCount: 1 });

      await cancelEmbeddingTrainTask('task_123');

      expect(MongoEmbeddingTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          status: EmbeddingTrainTaskStatusEnum.cancelled
        })
      );
    });
  });

  describe('updateEmbeddingCheckpointStage', () => {
    test('应该更新检查点阶段', async () => {
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      (MongoEmbeddingTrainTask.updateOne as any).mockResolvedValue({ modifiedCount: 1 });

      await updateEmbeddingCheckpointStage(
        'task_123',
        EmbeddingTaskCheckpointStageEnum.generate_trainset
      );

      expect(MongoEmbeddingTrainTask.updateOne).toHaveBeenCalled();
    });
  });

  describe('updateEmbeddingCheckpointData', () => {
    test('应该更新检查点数据', async () => {
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      (MongoEmbeddingTrainTask.updateOne as any).mockResolvedValue({ modifiedCount: 1 });

      await updateEmbeddingCheckpointData(
        'task_123',
        EmbeddingTaskCheckpointStageEnum.generate_trainset,
        {
          trainDatasetId: 'dataset-1'
        }
      );

      expect(MongoEmbeddingTrainTask.updateOne).toHaveBeenCalled();
    });

    test('应该支持 merge 模式合并数据', async () => {
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      (MongoEmbeddingTrainTask.updateOne as any).mockResolvedValue({ modifiedCount: 1 });

      await updateEmbeddingCheckpointData(
        'task_123',
        EmbeddingTaskCheckpointStageEnum.generate_trainset,
        { trainDatasetId: 'dataset-1' },
        true
      );

      expect(MongoEmbeddingTrainTask.updateOne).toHaveBeenCalled();
    });
  });
});
