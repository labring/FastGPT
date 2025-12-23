import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  RerankTrainsetStatusEnum,
  RerankTrainTaskStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';

// Mock 日志系统
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock MongoDB 模型
vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    }),
    findById: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    }),
    create: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/task/schema', () => ({
  MongoRerankTrainTask: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    }),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  }
}));

// Mock 权限认证
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn()
}));

// Mock 训练任务创建
vi.mock('@fastgpt/service/core/train/rerank/task/controller', () => ({
  createRerankTrainTask: vi.fn()
}));

// Mock 事务
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn((callback) => callback({}))
}));

// Mock 队列
vi.mock('@fastgpt/service/core/train/rerank/task/mq', () => ({
  rerankTrainTaskQueue: {
    add: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/data/mq', () => ({
  rerankTrainDataGenerateQueue: {
    add: vi.fn()
  }
}));

// Mock calculateTrainsetStats
vi.mock('@fastgpt/service/core/train/rerank/data/controller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/train/rerank/data/controller')>();
  return {
    ...actual,
    calculateTrainsetStats: vi.fn()
  };
});

describe('Create with Trainset API - 核心逻辑测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('waitForTrainsetReady 轮询逻辑', () => {
    test('数据集就绪时应返回训练集', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      // Mock 数据集已就绪（第一次调用 - 但这个mock不会被使用，因为先有create再有轮询）

      // 动态导入包含 waitForTrainsetReady 的模块
      // 注意：waitForTrainsetReady 是私有函数，这里测试的是整体行为
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { authApp } = await import('@fastgpt/service/support/permission/app/auth');
      const { createRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { rerankTrainTaskQueue } = await import('@fastgpt/service/core/train/rerank/task/mq');
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { calculateTrainsetStats } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      // 设置必要的 mocks
      vi.mocked(authApp).mockResolvedValueOnce({
        app: { _id: 'app-id', name: 'Test App' } as any,
        teamId: 'team-id',
        tmbId: 'tmb-id'
      } as any);

      // Mock findOne().lean() 链式调用
      vi.mocked(MongoRerankTrainTask.findOne).mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce(null)
      } as any);

      vi.mocked(MongoRerankTrainset.create).mockResolvedValueOnce([{ _id: 'trainset-id' }] as any);

      // waitForTrainsetReady 使用 findById 轮询检查
      vi.mocked(MongoRerankTrainset.findById).mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce({
          _id: 'trainset-id',
          status: RerankTrainsetStatusEnum.ready
        })
      } as any);

      // Mock calculateTrainsetStats
      vi.mocked(calculateTrainsetStats).mockResolvedValueOnce({
        dataCount: 10,
        positiveCount: 10,
        negativeCount: 50,
        sourceSummary: []
      });

      vi.mocked(createRerankTrainTask).mockResolvedValueOnce('task-id');
      vi.mocked(rerankTrainTaskQueue.add).mockResolvedValueOnce({ id: 'job-id' } as any);

      // 导入并调用 handler
      const handlerModule = await import(
        'D:/FastGPT/projects/app/src/pages/api/core/train/rerank/task/create-with-trainset'
      );
      const handler = handlerModule.default;

      const mockReq = {
        body: {
          appId: 'app-id',
          name: 'Test Task'
        }
      };

      const result = await handler(mockReq as any, {} as any);

      // NextAPI 包装后返回 { code, data } 格式
      expect(result).toEqual({
        code: 200,
        data: {
          taskId: 'task-id',
          status: RerankTrainTaskStatusEnum.pending
        }
      });
    });

    test('数据集为空时应抛出错误', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { authApp } = await import('@fastgpt/service/support/permission/app/auth');
      const { calculateTrainsetStats } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      vi.mocked(authApp).mockResolvedValueOnce({
        app: { _id: 'app-id', name: 'Test App' } as any,
        teamId: 'team-id',
        tmbId: 'tmb-id'
      } as any);

      vi.mocked(MongoRerankTrainTask.findOne).mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce(null)
      } as any);

      vi.mocked(MongoRerankTrainset.create).mockResolvedValueOnce([{ _id: 'trainset-id' }] as any);

      // waitForTrainsetReady 使用 findById 检查数据集状态
      vi.mocked(MongoRerankTrainset.findById).mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce({
          _id: 'trainset-id',
          status: RerankTrainsetStatusEnum.ready
        })
      } as any);

      // Mock calculateTrainsetStats - 返回空数据
      vi.mocked(calculateTrainsetStats).mockResolvedValueOnce({
        dataCount: 0,
        positiveCount: 0,
        negativeCount: 0,
        sourceSummary: []
      });

      const handlerModule = await import(
        'D:/FastGPT/projects/app/src/pages/api/core/train/rerank/task/create-with-trainset'
      );
      const handler = handlerModule.default;

      const mockReq = {
        body: {
          appId: 'app-id',
          name: 'Test Task'
        }
      };

      const result = await handler(mockReq as any, {} as any);

      // NextAPI 包装后错误会转换为 { code: 500, error: ... }
      expect(result).toEqual({
        code: 500,
        error: RerankTrainErrEnum.noTrainDataAvailable,
        url: undefined
      });
    });

    test('数据集生成失败时应抛出错误', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { authApp } = await import('@fastgpt/service/support/permission/app/auth');

      vi.mocked(authApp).mockResolvedValueOnce({
        app: { _id: 'app-id', name: 'Test App' } as any,
        teamId: 'team-id',
        tmbId: 'tmb-id'
      } as any);

      vi.mocked(MongoRerankTrainTask.findOne).mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce(null)
      } as any);

      vi.mocked(MongoRerankTrainset.create).mockResolvedValueOnce([{ _id: 'trainset-id' }] as any);

      // waitForTrainsetReady 使用 findById 检查数据集状态 - 生成失败
      vi.mocked(MongoRerankTrainset.findById).mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce({
          _id: 'trainset-id',
          status: RerankTrainsetStatusEnum.error
        })
      } as any);

      const handlerModule = await import(
        'D:/FastGPT/projects/app/src/pages/api/core/train/rerank/task/create-with-trainset'
      );
      const handler = handlerModule.default;

      const mockReq = {
        body: {
          appId: 'app-id',
          name: 'Test Task'
        }
      };

      const result = await handler(mockReq as any, {} as any);

      // NextAPI 包装后错误会转换为 { code: 500, error: ... }
      expect(result).toEqual({
        code: 500,
        error: RerankTrainErrEnum.trainsetGenerationFailed,
        url: undefined
      });
    });
  });

  describe('进行中任务检查', () => {
    test('存在进行中的任务时应返回错误', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { authApp } = await import('@fastgpt/service/support/permission/app/auth');

      vi.mocked(authApp).mockResolvedValueOnce({
        app: { _id: 'app-id', name: 'Test App' } as any,
        teamId: 'team-id',
        tmbId: 'tmb-id'
      } as any);

      // 有进行中的任务
      vi.mocked(MongoRerankTrainTask.findOne).mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce({
          _id: 'running-task-id',
          status: RerankTrainTaskStatusEnum.running
        })
      } as any);

      const handlerModule = await import(
        'D:/FastGPT/projects/app/src/pages/api/core/train/rerank/task/create-with-trainset'
      );
      const handler = handlerModule.default;

      const mockReq = {
        body: {
          appId: 'app-id',
          name: 'Test Task'
        }
      };

      const result = await handler(mockReq as any, {} as any);

      // NextAPI 包装后错误会转换为 { code: 500, error: ... }
      expect(result).toEqual({
        code: 500,
        error: RerankTrainErrEnum.taskAlreadyRunning,
        url: undefined
      });
    });
  });
});
