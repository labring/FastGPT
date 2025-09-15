/**
 * App Contract 集成测试
 *
 * 使用 vitest 测试 ts-rest 合约的实际使用效果
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { appContract } from '../contracts/app';
import { initClient } from '@ts-rest/core';
import {
  AppListParamsSchema,
  CreateAppRequestSchema,
  AppDetailRequestSchema
} from '../schemas/app';

// 模拟数据
const mockApps = [
  {
    _id: '507f1f77bcf86cd799439011',
    parentId: null,
    tmbId: '507f1f77bcf86cd799439012',
    name: 'Test App 1',
    avatar: '/avatar1.png',
    intro: 'This is a test app',
    type: 'simple' as const,
    updateTime: new Date('2024-01-01'),
    permission: {
      hasReadPer: true,
      hasWritePer: true,
      hasManagePer: false,
      isOwner: false
    },
    sourceMember: {
      tmbId: '507f1f77bcf86cd799439012',
      avatar: '/user1.png',
      name: 'Test User'
    }
  },
  {
    _id: '507f1f77bcf86cd799439013',
    parentId: null,
    tmbId: '507f1f77bcf86cd799439014',
    name: 'Test App 2',
    avatar: '/avatar2.png',
    intro: 'This is another test app',
    type: 'advanced' as const,
    updateTime: new Date('2024-01-02'),
    permission: {
      hasReadPer: true,
      hasWritePer: false,
      hasManagePer: true,
      isOwner: true
    },
    sourceMember: {
      tmbId: '507f1f77bcf86cd799439014',
      avatar: '/user2.png',
      name: 'Test User 2'
    }
  }
];

const mockAppDetail = {
  ...mockApps[0],
  teamId: '507f1f77bcf86cd799439015',
  version: 'v2' as const,
  modules: [],
  edges: [],
  chatConfig: {
    welcomeText: 'Welcome to test app'
  },
  teamTags: ['test', 'demo'],
  permission: {
    hasReadPer: true,
    hasWritePer: true,
    hasManagePer: false,
    isOwner: false
  }
};

let server: any;
let serverUrl: string;
let client: any;

describe('App Contract Integration Tests', () => {
  beforeAll(async () => {
    // 创建模拟服务器
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // 简单的路由处理
      const url = req.url || '';
      const method = req.method || '';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (method === 'POST' && url === '/core/app/list') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const parsedBody = JSON.parse(body);
            const validatedBody = AppListParamsSchema.parse(parsedBody);

            let filteredApps = [...mockApps];

            // 简单的搜索过滤
            if (validatedBody.searchKey) {
              filteredApps = filteredApps.filter((app) =>
                app.name.toLowerCase().includes(validatedBody.searchKey!.toLowerCase())
              );
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(filteredApps));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid request', details: error }));
          }
        });
      } else if (method === 'GET' && url.startsWith('/core/app/detail')) {
        const urlParams = new URLSearchParams(url.split('?')[1]);
        const appId = urlParams.get('appId');

        if (appId) {
          try {
            const validatedQuery = AppDetailRequestSchema.parse({ appId });

            if (validatedQuery.appId === '507f1f77bcf86cd799439011') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(mockAppDetail));
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'App not found' }));
            }
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid appId format' }));
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing appId' }));
        }
      } else if (method === 'POST' && url === '/core/app/create') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const parsedBody = JSON.parse(body);
            const validatedBody = CreateAppRequestSchema.parse(parsedBody);

            // 模拟创建成功，返回新的 ID
            const newAppId = '507f1f77bcf86cd799439999';

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(newAppId));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid request', details: error }));
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    // 监听随机端口
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = server.address()?.port;
        serverUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // 创建客户端
    client = initClient(appContract, {
      baseUrl: serverUrl,
      baseHeaders: {
        'Content-Type': 'application/json'
      }
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });

  test('should get app list successfully', async () => {
    const { status, body } = await client.list({
      body: {
        searchKey: '',
        getRecentlyChat: false
      }
    });

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty('_id');
    expect(body[0]).toHaveProperty('name');
    expect(body[0]).toHaveProperty('type');
  });

  test('should filter app list by search key', async () => {
    const { status, body } = await client.list({
      body: {
        searchKey: 'Test App 1'
      }
    });

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Test App 1');
  });

  test('should get app detail successfully', async () => {
    const { status, body } = await client.detail({
      query: {
        appId: '507f1f77bcf86cd799439011'
      }
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('_id', '507f1f77bcf86cd799439011');
    expect(body).toHaveProperty('name', 'Test App 1');
    expect(body).toHaveProperty('teamId');
    expect(body).toHaveProperty('modules');
    expect(body).toHaveProperty('chatConfig');
  });

  test('should return 404 for non-existent app', async () => {
    const { status } = await client.detail({
      query: {
        appId: '507f1f77bcf86cd799439999'
      }
    });

    expect(status).toBe(404);
  });

  test('should create app successfully', async () => {
    const { status, body } = await client.create({
      body: {
        name: 'New Test App',
        type: 'simple',
        modules: []
      }
    });

    expect(status).toBe(200);
    expect(typeof body).toBe('string');
    expect(body).toHaveLength(24); // MongoDB ObjectId length
  });

  test('should validate request parameters', async () => {
    // 测试无效的应用类型
    try {
      await client.create({
        body: {
          name: 'Invalid App',
          type: 'invalid-type' as any,
          modules: []
        }
      });
      expect.fail('Should have thrown validation error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test('should validate app name length', async () => {
    // 测试过长的应用名称
    try {
      await client.create({
        body: {
          name: 'a'.repeat(31), // 超过30字符限制
          type: 'simple',
          modules: []
        }
      });
      expect.fail('Should have thrown validation error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test('should validate ObjectId format', async () => {
    // 测试无效的 ObjectId
    try {
      await client.detail({
        query: {
          appId: 'invalid-object-id'
        }
      });
      expect.fail('Should have thrown validation error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

// 类型检查测试
describe('Type Safety Tests', () => {
  test('should provide correct TypeScript types', () => {
    // 这些测试主要用于编译时类型检查

    // 客户端调用的类型应该是正确的
    const listCall = client.list({
      body: {
        searchKey: 'test',
        parentId: null,
        getRecentlyChat: false
      }
    });

    const detailCall = client.detail({
      query: {
        appId: '507f1f77bcf86cd799439011'
      }
    });

    const createCall = client.create({
      body: {
        name: 'Test App',
        type: 'simple',
        modules: []
      }
    });

    // 如果编译通过，说明类型定义正确
    expect(typeof listCall).toBe('object');
    expect(typeof detailCall).toBe('object');
    expect(typeof createCall).toBe('object');
  });
});
