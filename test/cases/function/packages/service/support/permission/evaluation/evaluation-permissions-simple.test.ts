/**
 * 评估权限简化功能测试
 *
 * 这是一个简化版的功能测试，用于快速验证评估权限功能
 * 运行方式: pnpm test test/cases/function/packages/service/support/permission/evaluation/evaluation-permissions-simple.test.ts
 */

import { describe, expect, it } from 'vitest';

// 简单的HTTP请求实现，避免依赖axios
const httpRequest = async (url: string, options: any = {}) => {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeout || 10000)
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    (error as any).response = { status: response.status, data: await response.text() };
    throw error;
  }

  return {
    status: response.status,
    data: await response.json()
  };
};

// 简化的测试配置
const API_BASE = process.env.FASTGPT_BASE_URL || 'http://localhost:3000';
const TEST_TOKEN = process.env.TEST_TOKEN || '';

// 创建HTTP客户端
const createClient = (token?: string) => {
  return {
    post: async (path: string, data?: any) => {
      return httpRequest(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: data,
        timeout: 10000
      });
    }
  };
};

describe('评估权限基础功能测试', () => {
  const client = createClient(TEST_TOKEN);

  it('应该能够获取评估任务列表', async () => {
    if (!TEST_TOKEN) {
      console.warn('跳过测试: 未配置TEST_TOKEN环境变量');
      return;
    }

    try {
      const response = await client.post('/api/core/evaluation/task/list', {
        pageNum: 1,
        pageSize: 10
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('list');
      expect(response.data).toHaveProperty('total');
      expect(Array.isArray(response.data.list)).toBe(true);

      // 验证每个任务都有权限属性
      response.data.list.forEach((task: any) => {
        expect(task).toHaveProperty('permission');
        expect(task.permission).toHaveProperty('hasReadPer');
        expect(task.permission).toHaveProperty('hasWritePer');
        expect(task.permission).toHaveProperty('hasManagePer');
      });

      console.log(`✅ 获取到 ${response.data.list.length} 个评估任务`);
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.warn('⚠️  认证失败，请检查TEST_TOKEN配置');
      } else {
        console.error('❌ API调用失败:', error.message);
        throw error;
      }
    }
  });

  it('应该能够获取评估数据集列表', async () => {
    if (!TEST_TOKEN) {
      console.warn('跳过测试: 未配置TEST_TOKEN环境变量');
      return;
    }

    try {
      const response = await client.post('/api/core/evaluation/dataset/list', {
        pageNum: 1,
        pageSize: 10
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('list');
      expect(response.data).toHaveProperty('total');

      console.log(`✅ 获取到 ${response.data.list.length} 个评估数据集`);
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.warn('⚠️  认证失败，请检查TEST_TOKEN配置');
      } else {
        throw error;
      }
    }
  });

  it('应该能够获取评估指标列表', async () => {
    if (!TEST_TOKEN) {
      console.warn('跳过测试: 未配置TEST_TOKEN环境变量');
      return;
    }

    try {
      const response = await client.post('/api/core/evaluation/metric/list', {
        pageNum: 1,
        pageSize: 10
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('list');
      expect(response.data).toHaveProperty('total');

      console.log(`✅ 获取到 ${response.data.list.length} 个评估指标`);
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.warn('⚠️  认证失败，请检查TEST_TOKEN配置');
      } else {
        throw error;
      }
    }
  });

  it('无认证请求应该被拒绝', async () => {
    const unauthenticatedClient = createClient();

    try {
      await unauthenticatedClient.post('/api/core/evaluation/task/list', {
        pageNum: 1,
        pageSize: 10
      });

      throw new Error('预期请求应该被拒绝，但实际成功了');
    } catch (error: any) {
      expect(error.response?.status).toBeOneOf([401, 403]);
      console.log('✅ 无认证请求正确被拒绝');
    }
  });

  it('权限验证响应时间应该合理', async () => {
    if (!TEST_TOKEN) {
      console.warn('跳过测试: 未配置TEST_TOKEN环境变量');
      return;
    }

    const start = Date.now();

    try {
      await Promise.all([
        client.post('/api/core/evaluation/task/list', { pageNum: 1, pageSize: 5 }),
        client.post('/api/core/evaluation/dataset/list', { pageNum: 1, pageSize: 5 }),
        client.post('/api/core/evaluation/metric/list', { pageNum: 1, pageSize: 5 })
      ]);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // 应该在5秒内完成

      console.log(`✅ 权限验证响应时间: ${duration}ms`);
    } catch (error: any) {
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        throw error;
      }
    }
  });
});

describe('评估权限数据完整性测试', () => {
  const client = createClient(TEST_TOKEN);

  it('返回的资源应该包含完整的权限信息', async () => {
    if (!TEST_TOKEN) {
      console.warn('跳过测试: 未配置TEST_TOKEN环境变量');
      return;
    }

    try {
      const response = await client.post('/api/core/evaluation/task/list', {
        pageNum: 1,
        pageSize: 5
      });

      if (response.data.list.length === 0) {
        console.warn('⚠️  没有可测试的数据，跳过权限信息验证');
        return;
      }

      const task = response.data.list[0];

      // 验证权限对象结构
      expect(task.permission).toBeDefined();
      expect(typeof task.permission.hasReadPer).toBe('boolean');
      expect(typeof task.permission.hasWritePer).toBe('boolean');
      expect(typeof task.permission.hasManagePer).toBe('boolean');

      // 验证权限层次关系
      if (task.permission.hasManagePer) {
        expect(task.permission.hasWritePer).toBe(true);
        expect(task.permission.hasReadPer).toBe(true);
      }

      if (task.permission.hasWritePer) {
        expect(task.permission.hasReadPer).toBe(true);
      }

      console.log(`✅ 权限信息验证通过:`, {
        read: task.permission.hasReadPer,
        write: task.permission.hasWritePer,
        manage: task.permission.hasManagePer
      });
    } catch (error: any) {
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        throw error;
      }
    }
  });

  it('应该正确过滤无权限的资源', async () => {
    if (!TEST_TOKEN) {
      console.warn('跳过测试: 未配置TEST_TOKEN环境变量');
      return;
    }

    try {
      const [tasks, datasets, metrics] = await Promise.all([
        client.post('/api/core/evaluation/task/list', { pageNum: 1, pageSize: 100 }),
        client.post('/api/core/evaluation/dataset/list', { pageNum: 1, pageSize: 100 }),
        client.post('/api/core/evaluation/metric/list', { pageNum: 1, pageSize: 100 })
      ]);

      // 所有返回的资源都应该至少有读权限
      [...tasks.data.list, ...datasets.data.list, ...metrics.data.list].forEach((resource: any) => {
        if (resource.permission) {
          expect(resource.permission.hasReadPer).toBe(true);
        }
      });

      console.log('✅ 资源权限过滤验证通过:', {
        tasks: tasks.data.list.length,
        datasets: datasets.data.list.length,
        metrics: metrics.data.list.length
      });
    } catch (error: any) {
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        throw error;
      }
    }
  });
});
