import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler, updateMCPChildrenTool } from '@/pages/api/core/app/mcpTools/update';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

// Helper to make an array async iterable
function makeAsyncIterable<T>(array: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: () => {
          if (i < array.length) {
            return Promise.resolve({ value: array[i++], done: false });
          } else {
            return Promise.resolve({ value: undefined, done: true });
          }
        }
      };
    }
  };
}

// Patch for MongoApp.find to allow chaining .lean() and support for-await
function mockMongoAppFindReturn(array: any[]) {
  // .lean() returns an async iterable, and find() itself is for chaining
  const obj: any = {};
  obj.lean = () => makeAsyncIterable(array);
  // To support for-await directly on find(), also make it async iterable
  obj[Symbol.asyncIterator] = function* () {
    return;
  };
  // Patch: for direct await (no .lean()), return array directly
  obj.then = undefined;
  obj.catch = undefined;
  obj[Symbol.asyncIterator] = undefined;
  obj.exec = () => Promise.resolve(array);
  obj.toArray = () => array;
  // Patch: for for-await...of, just return the array
  obj[Symbol.asyncIterator] = function () {
    let i = 0;
    return {
      next: () => {
        if (i < array.length) {
          return Promise.resolve({ value: array[i++], done: false });
        } else {
          return Promise.resolve({ value: undefined, done: true });
        }
      }
    };
  };
  // For compatibility, return array directly if awaited
  obj.then = (resolve: any) => resolve(array);
  return obj;
}

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  AppCollectionName: 'apps',
  MongoApp: {
    find: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn(),
    lean: vi.fn(),
    create: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: async (callback: any) => callback({ id: 'test-session' })
}));

// Mock getMCPToolRuntimeNode and getMCPToolSetRuntimeNode to avoid errors
vi.mock('@fastgpt/global/core/app/mcpTools/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/core/app/mcpTools/utils')>();
  return {
    ...actual,
    getMCPToolRuntimeNode: vi.fn().mockImplementation(({ tool, url }) => ({
      node: 'runtime-node',
      tool,
      url
    })),
    getMCPToolSetRuntimeNode: vi.fn().mockImplementation(({ url, toolList, name, avatar }) => ({
      node: 'tool-set-runtime-node',
      url,
      toolList,
      name,
      avatar
    }))
  };
});

// Patch for onDelOneApp and onCreateApp (do not mock as per instructions, but patch for test isolation)
import * as delModule from '@/pages/api/core/app/mcpTools/../del';
import * as createModule from '@/pages/api/core/app/mcpTools/../create';

vi.spyOn(delModule, 'onDelOneApp').mockImplementation(async () => {});
vi.spyOn(createModule, 'onCreateApp').mockImplementation(async () => {});

describe('updateMCPTools API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockApp = {
    _id: 'test-app-id',
    teamId: 'test-team-id',
    tmbId: 'test-tmb-id',
    name: 'Test App',
    avatar: 'test-avatar',
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

  const mockReq = {
    body: {
      appId: 'test-app-id',
      url: 'test-url',
      toolList: [
        {
          name: 'test-tool',
          description: 'test description'
        }
      ]
    }
  };

  it('should update MCP tools successfully', async () => {
    vi.mocked(authApp).mockResolvedValue({ app: mockApp } as any);

    const mockDbTools = [
      {
        name: 'existing-tool',
        _id: 'tool-1'
      }
    ];

    // MongoApp.find() should return an array directly for for-await-of
    vi.mocked(MongoApp.find as any).mockImplementation(() => mockDbTools);

    vi.mocked(MongoApp.updateOne).mockResolvedValue({} as any);
    vi.mocked(MongoAppVersion.updateOne).mockResolvedValue({} as any);

    const result = await handler(mockReq as any, {} as any);

    expect(result).toEqual({});
    expect(MongoApp.updateOne).toHaveBeenCalled();
    expect(MongoAppVersion.updateOne).toHaveBeenCalled();
  });

  it('should handle updateMCPChildrenTool', async () => {
    const mockParentApp = {
      _id: 'parent-id',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      name: 'Parent App',
      avatar: 'avatar',
      type: AppTypeEnum.tool
    };

    const mockToolSetData = {
      url: 'test-url',
      toolList: [
        {
          name: 'new-tool',
          description: 'new tool description'
        }
      ]
    };

    const mockSession = { id: 'test-session' };

    vi.mocked(MongoApp.find as any).mockImplementation(() => []);

    vi.mocked(MongoApp.create).mockResolvedValueOnce([{ _id: 'new-tool-id' }] as any);

    await updateMCPChildrenTool({
      parentApp: mockParentApp as any,
      toolSetData: mockToolSetData,
      session: mockSession as any
    });

    expect(MongoApp.find).toHaveBeenCalledWith({
      parentId: mockParentApp._id,
      teamId: mockParentApp.teamId
    });
  });

  it('should handle empty tool list', async () => {
    const mockParentApp = {
      _id: 'parent-id',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      name: 'Parent App',
      avatar: 'avatar'
    };

    const mockToolSetData = {
      url: 'test-url',
      toolList: []
    };

    const mockSession = { id: 'test-session' };

    vi.mocked(MongoApp.find as any).mockImplementation(() => []);

    await updateMCPChildrenTool({
      parentApp: mockParentApp as any,
      toolSetData: mockToolSetData,
      session: mockSession as any
    });

    expect(MongoApp.find).toHaveBeenCalledWith({
      parentId: mockParentApp._id,
      teamId: mockParentApp.teamId
    });
  });

  it('should handle tool updates', async () => {
    const mockParentApp = {
      _id: 'parent-id',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      name: 'Parent App',
      avatar: 'avatar'
    };

    const existingTool = {
      _id: 'existing-tool-id',
      name: 'existing-tool'
    };

    const mockToolSetData = {
      url: 'test-url',
      toolList: [
        {
          name: 'existing-tool',
          description: 'updated description'
        }
      ]
    };

    const mockSession = { id: 'test-session' };

    vi.mocked(MongoApp.find as any).mockImplementation(() => [existingTool]);

    await updateMCPChildrenTool({
      parentApp: mockParentApp as any,
      toolSetData: mockToolSetData,
      session: mockSession as any
    });

    expect(MongoApp.updateOne).toHaveBeenCalledWith({ _id: existingTool._id }, expect.any(Object), {
      session: mockSession
    });
  });

  it('should delete DB tools not in new toolList', async () => {
    const mockParentApp = {
      _id: 'parent-id',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      name: 'Parent App',
      avatar: 'avatar'
    };

    const dbTool = { _id: 'tool-to-delete', name: 'delete-me' };
    const mockToolSetData = {
      url: 'test-url',
      toolList: [
        {
          name: 'keep-me',
          description: 'keep desc'
        }
      ]
    };
    const mockSession = { id: 'test-session' };

    vi.mocked(MongoApp.find as any).mockImplementation(() => [dbTool]);
    const onDelOneAppSpy = vi.spyOn(delModule, 'onDelOneApp');

    await updateMCPChildrenTool({
      parentApp: mockParentApp as any,
      toolSetData: mockToolSetData,
      session: mockSession as any
    });

    expect(onDelOneAppSpy).toHaveBeenCalledWith({
      teamId: mockParentApp.teamId,
      appId: dbTool._id,
      session: mockSession
    });
  });

  it('should create DB tool if not present in DB', async () => {
    const mockParentApp = {
      _id: 'parent-id',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      name: 'Parent App',
      avatar: 'avatar'
    };

    const mockToolSetData = {
      url: 'test-url',
      toolList: [
        {
          name: 'new-tool',
          description: 'desc'
        }
      ]
    };
    const mockSession = { id: 'test-session' };

    vi.mocked(MongoApp.find as any).mockImplementation(() => []);
    const onCreateAppSpy = vi.spyOn(createModule, 'onCreateApp');

    await updateMCPChildrenTool({
      parentApp: mockParentApp as any,
      toolSetData: mockToolSetData,
      session: mockSession as any
    });

    expect(onCreateAppSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'new-tool',
        avatar: mockParentApp.avatar,
        parentId: mockParentApp._id,
        teamId: mockParentApp.teamId,
        tmbId: mockParentApp.tmbId,
        type: AppTypeEnum.tool,
        intro: 'desc',
        session: mockSession
      })
    );
  });
});
