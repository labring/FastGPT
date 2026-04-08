import { describe, test, expect, vi, beforeEach } from 'vitest';
import { pLimit, buildModelEndpoint } from '@fastgpt/service/core/train/rerank/utils';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Rerank Utils', () => {
  let teamId: string;
  let tmbId: string;

  beforeEach(() => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439014';
    vi.clearAllMocks();
  });

  describe('pLimit', () => {
    test('应该限制并发执行数量', async () => {
      const limit = pLimit(2);
      const results: number[] = [];
      const delays = [50, 30, 20, 40];

      const tasks = delays.map((delay, index) =>
        limit(async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          results.push(index);
          return index;
        })
      );

      await Promise.all(tasks);

      // All tasks should complete
      expect(results).toHaveLength(4);
      expect(results.sort()).toEqual([0, 1, 2, 3]);
    });

    test('应该处理并发任务错误', async () => {
      const limit = pLimit(2);

      const tasks = [
        limit(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'success1';
        }),
        limit(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Task failed');
        }),
        limit(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'success2';
        })
      ];

      const results = await Promise.allSettled(tasks);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });

    test('应该正确处理并发数为1的情况', async () => {
      const limit = pLimit(1);
      const executionOrder: number[] = [];

      const tasks = [
        limit(async () => {
          executionOrder.push(1);
          await new Promise((resolve) => setTimeout(resolve, 30));
        }),
        limit(async () => {
          executionOrder.push(2);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }),
        limit(async () => {
          executionOrder.push(3);
          await new Promise((resolve) => setTimeout(resolve, 10));
        })
      ];

      await Promise.all(tasks);

      // With concurrency=1, tasks should execute sequentially
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    test('应该正确返回异步函数的结果', async () => {
      const limit = pLimit(3);

      const results = await Promise.all([
        limit(async () => 'result1'),
        limit(async () => 42),
        limit(async () => ({ key: 'value' }))
      ]);

      expect(results).toEqual(['result1', 42, { key: 'value' }]);
    });
  });

  describe('buildModelEndpoint', () => {
    test('应该构建完整的 endpoint 配置', () => {
      const modelConfig = {
        model: 'gpt-4',
        requestUrl: 'https://api.openai.com',
        requestAuth: 'sk-123456'
      };

      const endpoint = buildModelEndpoint(modelConfig);

      expect(endpoint).toEqual({
        model: 'gpt-4',
        base_url: 'https://api.openai.com',
        api_key: 'sk-123456'
      });
    });

    test('应该处理缺少 requestUrl 的情况', () => {
      const modelConfig = {
        model: 'gpt-4',
        requestAuth: 'sk-123456'
      };

      const endpoint = buildModelEndpoint(modelConfig);

      expect(endpoint).toEqual({
        model: 'gpt-4',
        api_key: 'sk-123456'
      });
      expect(endpoint.base_url).toBeUndefined();
    });

    test('应该处理缺少 requestAuth 的情况', () => {
      const modelConfig = {
        model: 'gpt-4',
        requestUrl: 'https://api.openai.com'
      };

      const endpoint = buildModelEndpoint(modelConfig);

      expect(endpoint).toEqual({
        model: 'gpt-4',
        base_url: 'https://api.openai.com'
      });
      expect(endpoint.api_key).toBeUndefined();
    });

    test('应该处理只有 model 字段的最小配置', () => {
      const modelConfig = {
        model: 'gpt-3.5-turbo'
      };

      const endpoint = buildModelEndpoint(modelConfig);

      expect(endpoint).toEqual({
        model: 'gpt-3.5-turbo'
      });
      expect(endpoint.base_url).toBeUndefined();
      expect(endpoint.api_key).toBeUndefined();
    });

    test('应该正确处理空字符串（falsy值不会被添加）', () => {
      const modelConfig = {
        model: '',
        requestUrl: '',
        requestAuth: ''
      };

      const endpoint = buildModelEndpoint(modelConfig);

      // Empty string is falsy; requestUrl and requestAuth will not be added
      expect(endpoint).toEqual({
        model: ''
      });
      expect(endpoint.base_url).toBeUndefined();
      expect(endpoint.api_key).toBeUndefined();
    });
  });
});
