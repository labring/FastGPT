import { describe, test, expect, vi, beforeEach } from 'vitest';
import { cleanupTrainModuleOnAppDelete } from '@fastgpt/service/core/app/controller';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';

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
    find: vi.fn(),
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/task/mq', () => ({
  rerankTrainTaskQueue: {
    getJob: vi.fn()
  }
}));

// Mock deleteRerankTrainTask 函数
vi.mock('@fastgpt/service/core/train/rerank/task/controller', async () => {
  const actual: any = await vi.importActual('@fastgpt/service/core/train/rerank/task/controller');
  return {
    ...actual,
    deleteRerankTrainTask: vi.fn().mockResolvedValue(undefined)
  };
});

describe('Train Module Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('应用删除级联清理', () => {
    test('应该删除应用的所有训练数据', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { deleteRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );

      // Mock 无进行中的任务（第一次find调用）
      // Mock 查询所有任务（第二次find调用）
      (MongoRerankTrainTask.find as any)
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue([])
        })
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue([{ _id: 'task_1', appId: 'app_1' }])
        });

      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 10 });
      (MongoRerankTrainset.deleteMany as any).mockResolvedValue({ deletedCount: 1 });

      const appId = 'app_1';
      await cleanupTrainModuleOnAppDelete(appId);

      // 验证查询进行中的任务
      expect(MongoRerankTrainTask.find).toHaveBeenNthCalledWith(
        1,
        {
          appId,
          status: {
            $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
          }
        },
        null,
        { session: undefined }
      );

      // 验证查询所有任务
      expect(MongoRerankTrainTask.find).toHaveBeenNthCalledWith(
        2,
        { appId },
        { _id: 1 },
        { session: undefined }
      );

      // 验证调用级联删除
      expect(deleteRerankTrainTask).toHaveBeenCalledTimes(1);
      expect(deleteRerankTrainTask).toHaveBeenCalledWith('task_1', undefined);

      // 验证删除训练数据和训练集
      expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalledWith(
        { appId },
        { session: undefined }
      );

      expect(MongoRerankTrainset.deleteMany).toHaveBeenCalledWith(
        { appId },
        { session: undefined }
      );
    });

    test('应该取消进行中的训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { rerankTrainTaskQueue } = await import('@fastgpt/service/core/train/rerank/task/mq');

      const mockJob = {
        remove: vi.fn().mockResolvedValue(undefined)
      };

      // Mock 有进行中的任务
      (MongoRerankTrainTask.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'task_1',
            appId: 'app_1',
            status: RerankTrainTaskStatusEnum.running,
            jobId: 'job_123'
          },
          {
            _id: 'task_2',
            appId: 'app_1',
            status: RerankTrainTaskStatusEnum.pending,
            jobId: 'job_456'
          }
        ])
      });

      (rerankTrainTaskQueue.getJob as any).mockResolvedValue(mockJob);
      (MongoRerankTrainTask.deleteMany as any).mockResolvedValue({ deletedCount: 2 });

      await cleanupTrainModuleOnAppDelete('app_1');

      // 验证任务被取消
      expect(rerankTrainTaskQueue.getJob).toHaveBeenCalledWith('job_123');
      expect(rerankTrainTaskQueue.getJob).toHaveBeenCalledWith('job_456');
      expect(mockJob.remove).toHaveBeenCalledTimes(2);
    });

    test('取消任务失败不应阻止删除流程', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { rerankTrainTaskQueue } = await import('@fastgpt/service/core/train/rerank/task/mq');
      const { deleteRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );

      // Mock 取消任务失败
      (MongoRerankTrainTask.find as any)
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue([
            {
              _id: 'task_1',
              appId: 'app_1',
              status: RerankTrainTaskStatusEnum.running,
              jobId: 'job_123'
            }
          ])
        })
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue([{ _id: 'task_1', appId: 'app_1' }])
        });

      (rerankTrainTaskQueue.getJob as any).mockRejectedValue(new Error('Job not found'));
      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 5 });

      // 不应抛出错误
      await expect(cleanupTrainModuleOnAppDelete('app_1')).resolves.not.toThrow();

      // 删除操作仍应继续
      expect(deleteRerankTrainTask).toHaveBeenCalled();
      expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalled();
    });

    test('空字符串不应执行任何操作', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      await cleanupTrainModuleOnAppDelete('');

      expect(MongoRerankTrainTask.find).not.toHaveBeenCalled();
      expect(MongoRerankTrainTask.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('级联删除数据一致性', () => {
    test('应用删除应清理所有层级的训练数据', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { deleteRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );

      (MongoRerankTrainTask.find as any)
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue([])
        })
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue([{ _id: 'task_test', appId: 'app_test' }])
        });

      let taskDeleted = false;
      let dataDeleted = false;
      let trainsetDeleted = false;

      (deleteRerankTrainTask as any).mockImplementation(() => {
        taskDeleted = true;
        return Promise.resolve();
      });

      (MongoRerankTrainsetData.deleteMany as any).mockImplementation(() => {
        dataDeleted = true;
        return Promise.resolve({ deletedCount: 10 });
      });

      (MongoRerankTrainset.deleteMany as any).mockImplementation(() => {
        trainsetDeleted = true;
        return Promise.resolve({ deletedCount: 1 });
      });

      await cleanupTrainModuleOnAppDelete('app_test');

      // 验证所有层级的数据都被删除
      expect(taskDeleted).toBe(true);
      expect(dataDeleted).toBe(true);
      expect(trainsetDeleted).toBe(true);
    });
  });
});
