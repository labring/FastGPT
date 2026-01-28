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

// Mock validation functions
vi.mock('@fastgpt/service/core/train/rerank/validation', () => ({
  validateTrainingEnvironment: vi.fn().mockResolvedValue(undefined),
  validateDatasetSynthesisIndexes: vi.fn().mockResolvedValue(undefined)
}));

describe('Create with Trainset API - 核心逻辑测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API handler should return immediately', () => {
    test('应该立即创建任务并添加到队列（不等待trainset就绪）', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { authApp } = await import('@fastgpt/service/support/permission/app/auth');
      const { createRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { rerankTrainTaskQueue } = await import('@fastgpt/service/core/train/rerank/task/mq');
      const { rerankTrainDataGenerateQueue } = await import(
        '@fastgpt/service/core/train/rerank/data/mq'
      );

      // 设置必要的 mocks
      vi.mocked(authApp).mockResolvedValueOnce({
        app: { _id: 'app-id', name: 'Test App' } as any,
        teamId: 'team-id',
        tmbId: 'tmb-id'
      } as any);

      // Mock findOne().lean() 链式调用 - 没有运行中的任务
      vi.mocked(MongoRerankTrainTask.findOne).mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce(null)
      } as any);

      // Mock trainset 创建
      vi.mocked(MongoRerankTrainset.create).mockResolvedValueOnce([{ _id: 'trainset-id' }] as any);

      // Mock 任务创建和队列
      vi.mocked(createRerankTrainTask).mockResolvedValueOnce('task-id');
      vi.mocked(rerankTrainDataGenerateQueue.add).mockResolvedValueOnce({
        id: 'generate-job-id'
      } as any);
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

      // 验证立即返回（不等待trainset就绪）
      expect(result).toEqual({
        code: 200,
        data: {
          taskId: 'task-id',
          status: RerankTrainTaskStatusEnum.pending
        }
      });

      // 验证创建了trainset
      expect(MongoRerankTrainset.create).toHaveBeenCalledWith([
        expect.objectContaining({
          appId: 'app-id',
          teamId: 'team-id',
          tmbId: 'tmb-id',
          status: RerankTrainsetStatusEnum.pending
        })
      ]);

      // 验证添加到数据生成队列
      expect(rerankTrainDataGenerateQueue.add).toHaveBeenCalled();

      // 验证创建了任务
      expect(createRerankTrainTask).toHaveBeenCalledWith({
        appId: 'app-id',
        trainsetId: 'trainset-id',
        teamId: 'team-id',
        tmbId: 'tmb-id',
        name: 'Test Task'
      });

      // 验证添加到任务队列
      expect(rerankTrainTaskQueue.add).toHaveBeenCalled();

      // 注意：不再调用 MongoRerankTrainset.findById（不再等待trainset就绪）
      expect(MongoRerankTrainset.findById).not.toHaveBeenCalled();
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
