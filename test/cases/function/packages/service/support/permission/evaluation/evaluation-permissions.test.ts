/**
 * 评估权限功能测试
 *
 * 此测试脚本用于验证FastGPT评估模块的权限控制功能
 * 通过实际的HTTP请求测试API接口的权限验证
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';

// HTTP请求类型定义
interface HttpResponse<T = any> {
  status: number;
  data: T;
}

// 简单的HTTP请求实现
const httpRequest = async (url: string, options: any = {}): Promise<HttpResponse> => {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeout || 30000)
  });

  const data = response.ok ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    (error as any).response = { status: response.status, data };
    throw error;
  }

  return {
    status: response.status,
    data
  };
};

// 测试环境配置
const TEST_CONFIG = {
  baseURL: process.env.FASTGPT_BASE_URL || 'http://localhost:3000',
  timeout: 30000,
  // 测试用户配置
  users: {
    owner: {
      token: process.env.OWNER_TOKEN || '',
      userId: process.env.OWNER_USER_ID || ''
    },
    member: {
      token: process.env.MEMBER_TOKEN || '',
      userId: process.env.MEMBER_USER_ID || ''
    },
    readOnly: {
      token: process.env.READONLY_TOKEN || '',
      userId: process.env.READONLY_USER_ID || ''
    },
    noAccess: {
      token: process.env.NO_ACCESS_TOKEN || '',
      userId: process.env.NO_ACCESS_USER_ID || ''
    }
  }
};

// API客户端类
class EvaluationAPIClient {
  private baseURL: string;
  private token?: string;

  constructor(token?: string) {
    this.baseURL = TEST_CONFIG.baseURL;
    this.token = token;
  }

  private async request(path: string, data?: any): Promise<HttpResponse> {
    return httpRequest(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: {
        ...(this.token && { Authorization: `Bearer ${this.token}` })
      },
      body: data,
      timeout: TEST_CONFIG.timeout
    });
  }

  // 评估任务相关API
  async createEvaluationTask(data: any): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/task/create', data);
  }

  async listEvaluationTasks(params: any = {}): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/task/list', params);
  }

  async getEvaluationTaskDetail(taskId: string): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/task/detail', { evaluationId: taskId });
  }

  async updateEvaluationTask(taskId: string, data: any): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/task/update', { evaluationId: taskId, ...data });
  }

  async deleteEvaluationTask(taskId: string): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/task/delete', { evaluationId: taskId });
  }

  // 评估数据集相关API
  async createEvaluationDataset(data: any): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/dataset/create', data);
  }

  async listEvaluationDatasets(params: any = {}): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/dataset/list', params);
  }

  async getEvaluationDatasetDetail(datasetId: string): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/dataset/detail', { datasetId });
  }

  async updateEvaluationDataset(datasetId: string, data: any): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/dataset/update', { datasetId, ...data });
  }

  async deleteEvaluationDataset(datasetId: string): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/dataset/delete', { datasetId });
  }

  // 评估指标相关API
  async createEvaluationMetric(data: any): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/metric/create', data);
  }

  async listEvaluationMetrics(params: any = {}): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/metric/list', params);
  }

  async getEvaluationMetricDetail(metricId: string): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/metric/detail', { metricId });
  }

  async updateEvaluationMetric(metricId: string, data: any): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/metric/update', { metricId, ...data });
  }

  async deleteEvaluationMetric(metricId: string): Promise<HttpResponse> {
    return this.request('/api/core/evaluation/metric/delete', { metricId });
  }
}

// 测试数据生成器
class TestDataGenerator {
  static generateDataset() {
    return {
      name: `测试数据集_${Date.now()}`,
      description: '功能测试自动生成的数据集',
      dataFormat: 'csv',
      columns: [
        { name: 'userInput', type: 'string', required: true, description: '用户输入' },
        { name: 'expectedOutput', type: 'string', required: true, description: '期望输出' }
      ],
      dataItems: [
        { userInput: '你好', expectedOutput: '您好，有什么可以帮助您的吗？' },
        { userInput: '今天天气怎么样？', expectedOutput: '很抱歉，我无法获取实时天气信息。' }
      ]
    };
  }

  static generateMetric() {
    return {
      name: `测试指标_${Date.now()}`,
      description: '功能测试自动生成的指标',
      type: 'ai_model',
      config: {
        model: 'gpt-3.5-turbo',
        systemPrompt: '请评估回答的质量，给出1-5的分数',
        temperature: 0.1
      }
    };
  }

  static generateTask(datasetId: string, metricIds: string[]) {
    return {
      name: `测试任务_${Date.now()}`,
      description: '功能测试自动生成的评估任务',
      datasetId,
      target: {
        type: 'workflow',
        config: {
          appId: process.env.TEST_APP_ID || 'test-app-id'
        }
      },
      metricIds
    };
  }
}

// 权限验证助手
class PermissionTestHelper {
  static async expectPermissionDenied(operation: () => Promise<HttpResponse>) {
    try {
      await operation();
      throw new Error('Expected permission denied, but operation succeeded');
    } catch (error: any) {
      expect(error.response?.status).toBeOneOf([401, 403]);
    }
  }

  static async expectSuccess(operation: () => Promise<HttpResponse>): Promise<HttpResponse> {
    try {
      const response = await operation();
      expect(response.status).toBe(200);
      return response;
    } catch (error: any) {
      console.error('Operation failed:', error.response?.data || error.message);
      throw error;
    }
  }

  static expectPermissionProperty(
    data: any,
    expectedPermissions: {
      hasReadPer: boolean;
      hasWritePer: boolean;
      hasManagePer: boolean;
    }
  ) {
    expect(data.permission).toBeDefined();
    expect(data.permission.hasReadPer).toBe(expectedPermissions.hasReadPer);
    expect(data.permission.hasWritePer).toBe(expectedPermissions.hasWritePer);
    expect(data.permission.hasManagePer).toBe(expectedPermissions.hasManagePer);
  }
}

describe('评估权限功能测试', () => {
  let ownerClient: EvaluationAPIClient;
  let memberClient: EvaluationAPIClient;
  let readOnlyClient: EvaluationAPIClient;
  let noAccessClient: EvaluationAPIClient;

  // 测试资源ID
  let testDatasetId: string;
  let testMetricId: string;
  let testTaskId: string;

  beforeAll(() => {
    // 验证测试环境配置
    if (!TEST_CONFIG.users.owner.token) {
      console.warn('警告: 未配置OWNER_TOKEN环境变量，部分测试可能跳过');
    }

    // 初始化API客户端
    ownerClient = new EvaluationAPIClient(TEST_CONFIG.users.owner.token);
    memberClient = new EvaluationAPIClient(TEST_CONFIG.users.member.token);
    readOnlyClient = new EvaluationAPIClient(TEST_CONFIG.users.readOnly.token);
    noAccessClient = new EvaluationAPIClient(TEST_CONFIG.users.noAccess.token);
  });

  afterAll(async () => {
    // 清理测试数据
    try {
      if (testTaskId) {
        await ownerClient.deleteEvaluationTask(testTaskId);
      }
      if (testDatasetId) {
        await ownerClient.deleteEvaluationDataset(testDatasetId);
      }
      if (testMetricId) {
        await ownerClient.deleteEvaluationMetric(testMetricId);
      }
    } catch (error) {
      console.warn('清理测试数据时出错:', error);
    }
  });

  describe('评估数据集权限测试', () => {
    it('Owner用户应该能够创建数据集', async () => {
      if (!TEST_CONFIG.users.owner.token) {
        console.warn('跳过测试: 未配置OWNER_TOKEN');
        return;
      }

      const datasetData = TestDataGenerator.generateDataset();
      const response = await PermissionTestHelper.expectSuccess(() =>
        ownerClient.createEvaluationDataset(datasetData)
      );

      testDatasetId = response.data.datasetId;
      expect(testDatasetId).toBeDefined();
    });

    it('Owner用户应该能够查看数据集列表', async () => {
      if (!TEST_CONFIG.users.owner.token) {
        console.warn('跳过测试: 未配置OWNER_TOKEN');
        return;
      }

      const response = await PermissionTestHelper.expectSuccess(() =>
        ownerClient.listEvaluationDatasets({ pageNum: 1, pageSize: 10 })
      );

      expect(response.data.list).toBeInstanceOf(Array);
      if (response.data.list.length > 0) {
        PermissionTestHelper.expectPermissionProperty(response.data.list[0], {
          hasReadPer: true,
          hasWritePer: true,
          hasManagePer: true
        });
      }
    });

    it('无权限用户不应该能够创建数据集', async () => {
      if (!TEST_CONFIG.users.noAccess.token) {
        console.warn('跳过测试: 未配置NO_ACCESS_TOKEN');
        return;
      }

      const datasetData = TestDataGenerator.generateDataset();
      await PermissionTestHelper.expectPermissionDenied(() =>
        noAccessClient.createEvaluationDataset(datasetData)
      );
    });

    it('只读用户应该能够查看但不能修改数据集', async () => {
      if (!TEST_CONFIG.users.readOnly.token || !testDatasetId) {
        console.warn('跳过测试: 未配置READONLY_TOKEN或无测试数据集');
        return;
      }

      // 应该能够查看详情
      const detailResponse = await PermissionTestHelper.expectSuccess(() =>
        readOnlyClient.getEvaluationDatasetDetail(testDatasetId)
      );

      PermissionTestHelper.expectPermissionProperty(detailResponse.data, {
        hasReadPer: true,
        hasWritePer: false,
        hasManagePer: false
      });

      // 不应该能够更新
      await PermissionTestHelper.expectPermissionDenied(() =>
        readOnlyClient.updateEvaluationDataset(testDatasetId, { name: '尝试修改' })
      );
    });
  });

  describe('评估指标权限测试', () => {
    it('Owner用户应该能够创建指标', async () => {
      if (!TEST_CONFIG.users.owner.token) {
        console.warn('跳过测试: 未配置OWNER_TOKEN');
        return;
      }

      const metricData = TestDataGenerator.generateMetric();
      const response = await PermissionTestHelper.expectSuccess(() =>
        ownerClient.createEvaluationMetric(metricData)
      );

      testMetricId = response.data.metricId;
      expect(testMetricId).toBeDefined();
    });

    it('Member用户应该能够查看指标列表', async () => {
      if (!TEST_CONFIG.users.member.token) {
        console.warn('跳过测试: 未配置MEMBER_TOKEN');
        return;
      }

      const response = await PermissionTestHelper.expectSuccess(() =>
        memberClient.listEvaluationMetrics({ pageNum: 1, pageSize: 10 })
      );

      expect(response.data.list).toBeInstanceOf(Array);
    });

    it('无权限用户不应该能够删除指标', async () => {
      if (!TEST_CONFIG.users.noAccess.token || !testMetricId) {
        console.warn('跳过测试: 未配置NO_ACCESS_TOKEN或无测试指标');
        return;
      }

      await PermissionTestHelper.expectPermissionDenied(() =>
        noAccessClient.deleteEvaluationMetric(testMetricId)
      );
    });
  });

  describe('评估任务权限测试', () => {
    it('Owner用户应该能够创建任务', async () => {
      if (!TEST_CONFIG.users.owner.token || !testDatasetId || !testMetricId) {
        console.warn('跳过测试: 缺少必要的配置或依赖资源');
        return;
      }

      const taskData = TestDataGenerator.generateTask(testDatasetId, [testMetricId]);
      const response = await PermissionTestHelper.expectSuccess(() =>
        ownerClient.createEvaluationTask(taskData)
      );

      testTaskId = response.data.evaluationId;
      expect(testTaskId).toBeDefined();
    });

    it('Owner用户应该能够管理任务', async () => {
      if (!TEST_CONFIG.users.owner.token || !testTaskId) {
        console.warn('跳过测试: 未配置OWNER_TOKEN或无测试任务');
        return;
      }

      // 查看详情
      const detailResponse = await PermissionTestHelper.expectSuccess(() =>
        ownerClient.getEvaluationTaskDetail(testTaskId)
      );

      PermissionTestHelper.expectPermissionProperty(detailResponse.data, {
        hasReadPer: true,
        hasWritePer: true,
        hasManagePer: true
      });

      // 更新任务
      await PermissionTestHelper.expectSuccess(() =>
        ownerClient.updateEvaluationTask(testTaskId, { name: '更新后的任务名称' })
      );
    });

    it('成员用户应该根据权限级别访问任务', async () => {
      if (!TEST_CONFIG.users.member.token || !testTaskId) {
        console.warn('跳过测试: 未配置MEMBER_TOKEN或无测试任务');
        return;
      }

      // 查看任务列表
      const listResponse = await PermissionTestHelper.expectSuccess(() =>
        memberClient.listEvaluationTasks({ pageNum: 1, pageSize: 10 })
      );

      expect(listResponse.data.list).toBeInstanceOf(Array);

      // 如果有权限访问任务，验证权限属性
      const task = listResponse.data.list.find((item: any) => item._id === testTaskId);
      if (task) {
        expect(task.permission).toBeDefined();
        expect(task.permission.hasReadPer).toBe(true);
      }
    });
  });

  describe('权限边界测试', () => {
    it('应该正确处理无效的资源ID', async () => {
      if (!TEST_CONFIG.users.owner.token) {
        console.warn('跳过测试: 未配置OWNER_TOKEN');
        return;
      }

      const invalidId = '000000000000000000000000';

      // 尝试访问不存在的资源
      try {
        await ownerClient.getEvaluationTaskDetail(invalidId);
        throw new Error('Expected error for invalid resource ID');
      } catch (error: any) {
        expect(error.response?.status).toBeOneOf([400, 404]);
      }
    });

    it('应该正确处理未认证的请求', async () => {
      const unauthenticatedClient = new EvaluationAPIClient();

      await PermissionTestHelper.expectPermissionDenied(() =>
        unauthenticatedClient.listEvaluationTasks()
      );
    });

    it('应该正确处理过期的Token', async () => {
      const expiredTokenClient = new EvaluationAPIClient('expired-token');

      await PermissionTestHelper.expectPermissionDenied(() =>
        expiredTokenClient.listEvaluationTasks()
      );
    });
  });

  describe('权限继承和聚合测试', () => {
    it('应该正确聚合团队和个人权限', async () => {
      if (!TEST_CONFIG.users.member.token) {
        console.warn('跳过测试: 未配置MEMBER_TOKEN');
        return;
      }

      // 查看成员的资源列表，验证权限聚合
      const response = await PermissionTestHelper.expectSuccess(() =>
        memberClient.listEvaluationTasks({ pageNum: 1, pageSize: 10 })
      );

      // 每个返回的资源都应该至少有读权限
      response.data.list.forEach((task: any) => {
        expect(task.permission.hasReadPer).toBe(true);
      });
    });

    it('应该正确过滤无权限的资源', async () => {
      if (!TEST_CONFIG.users.readOnly.token) {
        console.warn('跳过测试: 未配置READONLY_TOKEN');
        return;
      }

      // 只读用户应该只能看到有读权限的资源
      const response = await PermissionTestHelper.expectSuccess(() =>
        readOnlyClient.listEvaluationTasks({ pageNum: 1, pageSize: 10 })
      );

      // 所有返回的任务都应该有读权限
      response.data.list.forEach((task: any) => {
        expect(task.permission.hasReadPer).toBe(true);
      });
    });
  });
});

// 性能测试
describe('评估权限性能测试', () => {
  let ownerClient: EvaluationAPIClient;

  beforeAll(() => {
    ownerClient = new EvaluationAPIClient(TEST_CONFIG.users.owner.token);
  });

  it('权限检查不应该显著影响API响应时间', async () => {
    if (!TEST_CONFIG.users.owner.token) {
      console.warn('跳过测试: 未配置OWNER_TOKEN');
      return;
    }

    const start = Date.now();

    // 并发请求多个资源列表
    const promises = [
      ownerClient.listEvaluationTasks({ pageSize: 50 }),
      ownerClient.listEvaluationDatasets({ pageSize: 50 }),
      ownerClient.listEvaluationMetrics({ pageSize: 50 })
    ];

    await Promise.all(promises);

    const duration = Date.now() - start;

    // 权限检查不应该让API响应时间超过5秒
    expect(duration).toBeLessThan(5000);
  });

  it('大量数据下的权限过滤性能', async () => {
    if (!TEST_CONFIG.users.owner.token) {
      console.warn('跳过测试: 未配置OWNER_TOKEN');
      return;
    }

    const start = Date.now();

    // 请求大量数据进行权限过滤
    await ownerClient.listEvaluationTasks({ pageSize: 100 });

    const duration = Date.now() - start;

    // 即使有大量数据，权限过滤也不应该超过3秒
    expect(duration).toBeLessThan(3000);
  });
});
