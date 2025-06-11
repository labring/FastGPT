import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler, updateMCPChildrenTool } from '@/pages/api/core/app/mcpTools/update';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

// Helper to make an async iterable array
function makeAsyncIterable<T>(arr: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      let i = 0;
      return {
        next: () =>
          Promise.resolve(
            i < arr.length ? { value: arr[i++], done: false } : { value: undefined, done: true }
          )
      };
    }
  };
}

// Helper to simulate MongoApp.find returning async iterable array
function makeFindReturnsAsyncIterable(arr: any[]) {
  // Simulate the Mongoose Query object, supporting for-await-of
  const asyncIterable = makeAsyncIterable(arr);
  // Simulate .lean() returning the async iterable itself (for legacy code)
  (asyncIterable as any).lean = () => asyncIterable;
  // Patch: also return an array for .toArray() if called
  (asyncIterable as any).toArray = () => Promise.resolve(arr);
  // Patch: so you can spread [...dbTools] if needed
  (asyncIterable as any)[Symbol.iterator] = function* () {
    for (const item of arr) yield item;
  };
  // Patch: add .find method for array-like use in tests
  (asyncIterable as any).find = (predicate: (item: any) => boolean) => arr.find(predicate);
  // Patch: add .map for array-like use
  (asyncIterable as any).map = (fn: (item: any) => any) => arr.map(fn);
  // Patch: add .filter for array-like use
  (asyncIterable as any).filter = (fn: (item: any) => boolean) => arr.filter(fn);
  // Patch: add .length
  (asyncIterable as any).length = arr.length;
  return asyncIterable;
}

// ---- Patch for onDelOneApp to avoid "children is not iterable" ----
vi.mock('@/pages/api/core/app/del', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/pages/api/core/app/del')>();
  return {
    ...actual,
    onDelOneApp: vi.fn().mockResolvedValue(undefined)
  };
});
// Patch for onCreateApp (no-op)
vi.mock('@/pages/api/core/app/create', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/pages/api/core/app/create')>();
  return {
    ...actual,
    onCreateApp: vi.fn().mockResolvedValue(undefined)
  };
});

// Patch for getMCPToolRuntimeNode and getMCPToolSetRuntimeNode
vi.mock('@fastgpt/global/core/app/mcpTools/utils', () => ({
  getMCPToolRuntimeNode: vi.fn((args) => ({ ...args, fake: true })),
  getMCPToolSetRuntimeNode: vi.fn((args) => ({ ...args, fake: true }))
}));

// Patch for encryptSecret (simulate encryption)
vi.mock('@fastgpt/global/common/secret/utils', () => ({
  encryptSecret: vi.fn((value: string, key: string) => `enc(${value})`)
}));

vi.mock('@fastgpt/service/core/app/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/app/schema')>();
  // MongoApp.find returns an async iterable (not just an array)
  return {
    ...actual,
    MongoApp: {
      find: vi.fn(),
      updateOne: vi.fn(),
      findById: vi.fn(),
      create: vi.fn().mockResolvedValue([{ _id: 'mockAppId' }])
    }
  };
});

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn()
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn((callback) => callback({ id: 'mockSession' }))
}));

describe('updateMCPTools API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AES256_SECRET_KEY = 'test-key';
    // Patch MongoApp.find to always return an async iterable for for-await-of support, and with .find method for array-like ops
    vi.mocked(MongoApp.find).mockImplementation(() =>
      makeFindReturnsAsyncIterable([
        {
          _id: 'tool1',
          name: 'existingTool'
        }
      ])
    );
  });

  it('should update MCP tools successfully', async () => {
    const mockApp = {
      _id: 'app1',
      teamId: 'team1',
      tmbId: 'tmb1',
      name: 'Test App',
      avatar: 'avatar.png',
      modules: [
        {
          flowNodeType: FlowNodeTypeEnum.toolSet,
          inputs: [
            {
              value: {
                url: 'old-url',
                toolList: []
              }
            }
          ]
        }
      ]
    };

    vi.mocked(authApp).mockResolvedValue({
      app: mockApp,
      teamId: 'team1'
    } as any);

    // Patch MongoApp.find for this test to return a dbTools with .find
    vi.mocked(MongoApp.find).mockImplementation(() =>
      makeFindReturnsAsyncIterable([
        {
          _id: 'tool1',
          name: 'existingTool'
        }
      ])
    );

    const req = {
      body: {
        appId: 'app1',
        url: 'https://api.test',
        headerAuth: {
          auth1: {
            value: 'test-value'
          }
        },
        toolList: [
          {
            name: 'tool1',
            description: 'test tool'
          }
        ]
      }
    };

    await handler(req as any, {} as any);

    expect(mongoSessionRun).toHaveBeenCalled();
    expect(MongoApp.updateOne).toHaveBeenCalledWith(
      { _id: 'app1' },
      expect.objectContaining({
        modules: expect.any(Array),
        updateTime: expect.any(Date)
      }),
      expect.anything()
    );
    expect(MongoAppVersion.updateOne).toHaveBeenCalled();
  });

  it('should handle updateMCPChildrenTool correctly', async () => {
    // Patch MongoApp.find for this test to return two "existing" tools with .find method
    vi.mocked(MongoApp.find).mockImplementation(() =>
      makeFindReturnsAsyncIterable([
        {
          _id: 'tool1',
          name: 'existingTool'
        }
      ])
    );

    const mockParentApp = {
      _id: 'parent1',
      teamId: 'team1',
      tmbId: 'tmb1',
      name: 'Parent App',
      avatar: 'avatar.png'
    };

    const toolSetData = {
      url: 'https://api.test',
      toolList: [
        {
          name: 'newTool',
          description: 'new test tool'
        }
      ],
      headerAuth: {
        auth1: {
          secret: 'encrypted',
          value: ''
        }
      }
    };

    await updateMCPChildrenTool({
      parentApp: mockParentApp as any,
      toolSetData,
      session: { id: 'mockSession' } as any
    });

    expect(MongoApp.find).toHaveBeenCalledWith({
      parentId: 'parent1',
      teamId: 'team1'
    });
  });

  it('should handle empty headerAuth', async () => {
    const mockApp = {
      _id: 'app1',
      teamId: 'team1',
      name: 'Test App',
      avatar: 'avatar.png',
      modules: [
        {
          flowNodeType: FlowNodeTypeEnum.toolSet,
          inputs: [
            {
              value: {
                url: 'old-url',
                toolList: []
              }
            }
          ]
        }
      ]
    };

    vi.mocked(authApp).mockResolvedValue({
      app: mockApp as any,
      teamId: 'team1'
    });

    // Patch MongoApp.find for this test to return a dbTools with .find
    vi.mocked(MongoApp.find).mockImplementation(() =>
      makeFindReturnsAsyncIterable([
        {
          _id: 'tool1',
          name: 'existingTool'
        }
      ])
    );

    const req = {
      body: {
        appId: 'app1',
        url: 'https://api.test',
        headerAuth: {},
        toolList: []
      }
    };

    await handler(req as any, {} as any);
    expect(mongoSessionRun).toHaveBeenCalled();
  });

  it('should handle case when toolSetNode is not found', async () => {
    const mockApp = {
      _id: 'app1',
      teamId: 'team1',
      name: 'Test App',
      avatar: 'avatar.png',
      modules: []
    };

    vi.mocked(authApp).mockResolvedValue({
      app: mockApp as any,
      teamId: 'team1'
    });

    // Patch MongoApp.find for this test to return a dbTools with .find
    vi.mocked(MongoApp.find).mockImplementation(() =>
      makeFindReturnsAsyncIterable([
        {
          _id: 'tool1',
          name: 'existingTool'
        }
      ])
    );

    const req = {
      body: {
        appId: 'app1',
        url: 'https://api.test',
        headerAuth: {},
        toolList: []
      }
    };

    await handler(req as any, {} as any);
    expect(mongoSessionRun).toHaveBeenCalled();
  });

  it('should handle toolSetData and toolList with multiple tools', async () => {
    // Patch MongoApp.find for this test to return multiple tools with .find method
    vi.mocked(MongoApp.find).mockImplementation(() =>
      makeFindReturnsAsyncIterable([
        {
          _id: 'tool1',
          name: 'existingTool'
        },
        {
          _id: 'tool2',
          name: 'tool2'
        }
      ])
    );

    const mockParentApp = {
      _id: 'parent1',
      teamId: 'team1',
      tmbId: 'tmb1',
      name: 'Parent App',
      avatar: 'avatar.png'
    };

    const toolSetData = {
      url: 'https://api.test',
      toolList: [
        {
          name: 'existingTool',
          description: 'should update'
        },
        {
          name: 'newTool',
          description: 'should create'
        }
      ],
      headerAuth: {
        auth1: {
          secret: 'encrypted',
          value: ''
        }
      }
    };

    await updateMCPChildrenTool({
      parentApp: mockParentApp as any,
      toolSetData,
      session: { id: 'mockSession' } as any
    });

    expect(MongoApp.find).toHaveBeenCalledWith({
      parentId: 'parent1',
      teamId: 'team1'
    });
  });
});
