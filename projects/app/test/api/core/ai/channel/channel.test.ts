import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

const aiproxyMocks = vi.hoisted(() => {
  const groupBatchDelete = vi.fn();
  const groupBatchUpdateStatus = vi.fn();
  const groupCreate = vi.fn();
  const groupUpdate = vi.fn();
  const groupDelete = vi.fn();
  const groupUpdateStatus = vi.fn();
  const groupGet = vi.fn();

  const systemCreate = vi.fn();
  const systemUpdate = vi.fn();
  const systemDelete = vi.fn();
  const systemUpdateStatus = vi.fn();
  const systemBatchDelete = vi.fn();
  const systemBatchUpdateStatus = vi.fn();
  const systemGet = vi.fn();

  const globalGroupGet = vi.fn();

  const group = vi.fn((_groupId: string) => ({
    channels: {
      get: groupGet,
      create: groupCreate,
      update: groupUpdate,
      delete: groupDelete,
      updateStatus: groupUpdateStatus,
      batchDelete: groupBatchDelete,
      batchUpdateStatus: groupBatchUpdateStatus
    }
  }));

  return {
    systemGet,
    systemCreate,
    systemUpdate,
    systemDelete,
    systemUpdateStatus,
    systemBatchDelete,
    systemBatchUpdateStatus,
    groupGet,
    groupCreate,
    groupUpdate,
    groupDelete,
    groupUpdateStatus,
    groupBatchDelete,
    groupBatchUpdateStatus,
    globalGroupGet,
    group
  };
});
import {
  getBatchChannelsAffectedModels,
  getChannelModels,
  getChannelAffectedModels
} from '@fastgpt/service/core/ai/channel/association';
import {
  getGlobalGroupChannelList,
  getMemberChannelList,
  getSystemChannelList
} from '@fastgpt/service/core/ai/channel/list';
import { getChannelTypeMetas } from '@fastgpt/service/core/ai/channel/provider';
import type { AiproxyGroupChannel } from '@fastgpt/service/thirdProvider/aiproxy/type';
import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/channel/api';
import { Call } from '@test/utils/request';
import listHandler from '@/pages/api/core/ai/channel/list';
import createHandler from '@/pages/api/core/ai/channel/create';
import updateHandler from '@/pages/api/core/ai/channel/update';
import deleteHandler from '@/pages/api/core/ai/channel/delete';
import batchHandler from '@/pages/api/core/ai/channel/batch';
import statusHandler from '@/pages/api/core/ai/channel/status';
import affectedModelsHandler from '@/pages/api/core/ai/channel/affectedModels';
import modelsHandler from '@/pages/api/core/ai/channel/models';
import providerMetasHandler from '@/pages/api/core/ai/channel/providerMetas';

// Mock the aiproxy client so no real aiproxy call happens.
vi.mock('@fastgpt/service/thirdProvider/aiproxy/client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/thirdProvider/aiproxy/client')>();
  return {
    ...actual,
    aiProxyClient: {
      system: {
        channels: {
          get: aiproxyMocks.systemGet,
          create: aiproxyMocks.systemCreate,
          update: aiproxyMocks.systemUpdate,
          delete: aiproxyMocks.systemDelete,
          updateStatus: aiproxyMocks.systemUpdateStatus,
          batchDelete: aiproxyMocks.systemBatchDelete,
          batchUpdateStatus: aiproxyMocks.systemBatchUpdateStatus
        }
      },
      globalGroupChannels: {
        get: aiproxyMocks.globalGroupGet
      },
      group: aiproxyMocks.group
    }
  };
});

// Mock the aiproxy-facing service layer so no real aiproxy call happens.
// The real controller helpers (assertMemberChannelPermission etc.) stay intact.
vi.mock('@fastgpt/service/core/ai/channel/association', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/channel/association')>();
  return {
    ...actual,
    getChannelAffectedModels: vi.fn(),
    getBatchChannelsAffectedModels: vi.fn(),
    getChannelModels: vi.fn()
  };
});
vi.mock('@fastgpt/service/core/ai/channel/list', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/channel/list')>();
  return {
    ...actual,
    getSystemChannelList: vi.fn(),
    getMemberChannelList: vi.fn(),
    getGlobalGroupChannelList: vi.fn()
  };
});
vi.mock('@fastgpt/service/core/ai/channel/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/channel/provider')>();
  return {
    ...actual,
    getChannelTypeMetas: vi.fn()
  };
});

vi.mock('@fastgpt/service/support/permission/user/auth', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/user/auth')>();
  return {
    ...actual,
    authUserPer: vi.fn()
  };
});

const TMB_ID = 'tmbId';
const GROUP_ID = `fastgpt:tmb:${TMB_ID}`;

const mockAuth = (isRoot: boolean, permission: TeamPermission) => {
  vi.mocked(authUserPer).mockResolvedValue({
    userId: 'userId',
    teamId: 'teamId',
    tmbId: TMB_ID,
    isRoot,
    permission,
    tmb: { permission }
  } as any);
};

const memberWithCreatePer = () => mockAuth(false, new TeamPermission({ isOwner: true }));
const memberWithoutCreatePer = () => mockAuth(false, new TeamPermission({ isOwner: false }));
const rootAuth = () => mockAuth(true, new TeamPermission({ isOwner: true }));

const channelItem = (id: number, relatedModelCount = 0): ChannelListItem => ({
  id,
  name: `channel-${id}`,
  type: 1,
  status: 1,
  models: ['gpt-4o'],
  relatedModelCount
});

const groupChannel = (id: number, groupId: string): AiproxyGroupChannel => ({
  id,
  name: `channel-${id}`,
  type: 1,
  status: 1,
  models: ['gpt-4o'],
  group_id: groupId
});

// A system channel is a plain channel without group_id
const systemChannel = (id: number) => ({ ...groupChannel(id, ''), group_id: undefined });

const updateBody = {
  id: 12,
  channelType: 'team',
  name: 'new name',
  type: 1,
  key: 'key',
  models: ['gpt-4o']
};
const systemUpdateBody = { ...updateBody, channelType: 'system' };

describe('GET /api/core/ai/channel/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // F1 场景1/场景3: list is read-only — members without model-create permission
  // still view their own channels (frontend disables the create button instead).
  it('member without create permission can still view own channels', async () => {
    memberWithoutCreatePer();
    vi.mocked(getMemberChannelList).mockResolvedValue({
      list: [channelItem(1, 2)],
      total: 1
    });

    const res = await Call(listHandler, { query: {} });

    expect(res.code).toBe(200);
    expect(vi.mocked(getMemberChannelList)).toHaveBeenCalledWith({
      tmbId: TMB_ID,
      pageNum: undefined,
      pageSize: undefined
    });
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].id).toBe(1);
  });

  it('returns the member own-channel view (with relatedModelCount)', async () => {
    memberWithCreatePer();
    vi.mocked(getMemberChannelList).mockResolvedValue({
      list: [channelItem(1, 2)],
      total: 1
    });

    const res = await Call(listHandler, { query: { pageNum: 1, pageSize: 10 } });

    expect(res.code).toBe(200);
    expect(vi.mocked(getMemberChannelList)).toHaveBeenCalledWith({
      tmbId: TMB_ID,
      pageNum: 1,
      pageSize: 10
    });
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].id).toBe(1);
    expect(res.data.list[0].relatedModelCount).toBe(2);
    expect(vi.mocked(getSystemChannelList)).not.toHaveBeenCalled();
    expect(vi.mocked(getGlobalGroupChannelList)).not.toHaveBeenCalled();
  });

  it('root with channelType=team only gets the root own-channel view', async () => {
    rootAuth();
    vi.mocked(getMemberChannelList).mockResolvedValue({
      list: [channelItem(5, 1)],
      total: 1
    });

    const res = await Call(listHandler, { query: { channelType: 'team' } });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(1);
    expect(vi.mocked(getMemberChannelList)).toHaveBeenCalledWith({
      tmbId: TMB_ID,
      pageNum: undefined,
      pageSize: undefined
    });
    expect(vi.mocked(getGlobalGroupChannelList)).not.toHaveBeenCalled();
  });

  it('member declaring channelType=system is rejected with rootOnlyPermit', async () => {
    memberWithCreatePer();

    const res = await Call(listHandler, { query: { channelType: 'system' } });

    expect(res.code).toBe(500);
    expect(res.error).toBe('rootOnlyPermit');
    expect(vi.mocked(getSystemChannelList)).not.toHaveBeenCalled();
    expect(vi.mocked(getMemberChannelList)).not.toHaveBeenCalled();
  });
});

describe('POST /api/core/ai/channel/create (channelType declared by caller)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('member declares channelType=team → creates in own group (groupId derived from session)', async () => {
    memberWithCreatePer();

    const res = await Call(createHandler, {
      body: { channelType: 'team', name: 'my channel', type: 1, key: 'key', models: ['gpt-4o'] }
    });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.group).toHaveBeenCalledWith(GROUP_ID);
    expect(aiproxyMocks.groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my channel' })
    );
    expect(aiproxyMocks.systemCreate).not.toHaveBeenCalled();
  });

  it('member without create permission is rejected with unAuthChannel', async () => {
    memberWithoutCreatePer();

    const res = await Call(createHandler, {
      body: { channelType: 'team', name: 'my channel', type: 1, key: 'key', models: ['gpt-4o'] }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('unAuthChannel');
    expect(aiproxyMocks.groupCreate).not.toHaveBeenCalled();
    expect(aiproxyMocks.systemCreate).not.toHaveBeenCalled();
  });

  it('member declaring channelType=system is rejected (system channels are root-only)', async () => {
    memberWithCreatePer();

    const res = await Call(createHandler, {
      body: { channelType: 'system', name: 'my channel', type: 1, key: 'key', models: ['gpt-4o'] }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('rootOnlyPermit');
    expect(aiproxyMocks.systemCreate).not.toHaveBeenCalled();
    expect(aiproxyMocks.groupCreate).not.toHaveBeenCalled();
  });

  it('root declaring channelType=system creates a system channel', async () => {
    rootAuth();

    const res = await Call(createHandler, {
      body: {
        channelType: 'system',
        name: 'system channel',
        type: 1,
        key: 'key',
        models: ['gpt-4o']
      }
    });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.systemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'system channel' })
    );
    expect(aiproxyMocks.groupCreate).not.toHaveBeenCalled();
  });

  it('root declaring channelType=team creates in root own team group (root is also a team admin)', async () => {
    rootAuth();

    const res = await Call(createHandler, {
      body: {
        channelType: 'team',
        name: 'root team channel',
        type: 1,
        key: 'key',
        models: ['gpt-4o']
      }
    });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.group).toHaveBeenCalledWith(GROUP_ID);
    expect(aiproxyMocks.groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'root team channel' })
    );
    expect(aiproxyMocks.systemCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/core/ai/channel/providerMetas (channel form hints)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('member without create permission can fetch provider metas', async () => {
    memberWithoutCreatePer();
    vi.mocked(getChannelTypeMetas).mockResolvedValue({
      1: { defaultBaseUrl: 'https://api.openai.com/v1', keyHelp: 'sk-...', name: 'openai' }
    });

    const res = await Call(providerMetasHandler, { query: {} });

    expect(res.code).toBe(200);
    expect(vi.mocked(getChannelTypeMetas)).toHaveBeenCalled();
    expect(res.data[1]).toEqual({
      defaultBaseUrl: 'https://api.openai.com/v1',
      keyHelp: 'sk-...',
      name: 'openai'
    });
  });

  it('root can fetch provider metas', async () => {
    rootAuth();
    vi.mocked(getChannelTypeMetas).mockResolvedValue({
      14: { defaultBaseUrl: 'https://api.anthropic.com', keyHelp: 'sk-ant-...', name: 'anthropic' }
    });

    const res = await Call(providerMetasHandler, { query: {} });

    expect(res.code).toBe(200);
    expect(res.data[14].name).toBe('anthropic');
  });
});

describe('PUT /api/core/ai/channel/update (ownership routing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('member without create permission can update an existing own channel', async () => {
    memberWithoutCreatePer();
    aiproxyMocks.groupGet.mockResolvedValue(groupChannel(12, GROUP_ID));

    const res = await Call(updateHandler, { body: updateBody });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.group).toHaveBeenCalledWith(GROUP_ID);
    expect(aiproxyMocks.groupUpdate).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ name: 'new name' })
    );
  });

  it('member routes to the own group channel variant when the id is in own group', async () => {
    memberWithCreatePer();
    aiproxyMocks.groupGet.mockResolvedValue(groupChannel(12, GROUP_ID));

    const res = await Call(updateHandler, { body: updateBody });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.group).toHaveBeenCalledWith(GROUP_ID);
    expect(aiproxyMocks.groupUpdate).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ name: 'new name' })
    );
    expect(aiproxyMocks.systemUpdate).not.toHaveBeenCalled();
  });

  it('member operating an id outside own group rejects channelNotExist', async () => {
    memberWithCreatePer();
    aiproxyMocks.groupGet.mockRejectedValue({ response: { status: 404 } });

    const res = await Call(updateHandler, { body: { ...updateBody, id: 99 } });

    expect(res.code).toBe(500);
    expect(res.error).toBe('channelNotExist');
    expect(aiproxyMocks.groupUpdate).not.toHaveBeenCalled();
    expect(aiproxyMocks.systemUpdate).not.toHaveBeenCalled();
  });

  it('update rejects a partial payload (PUT is a full replacement)', async () => {
    memberWithCreatePer();
    aiproxyMocks.groupGet.mockResolvedValue(groupChannel(12, GROUP_ID));

    const res = await Call(updateHandler, {
      body: { id: 12, channelType: 'team', name: 'only name' }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('invalidModelConfig');
    expect(aiproxyMocks.groupUpdate).not.toHaveBeenCalled();
  });

  it('root routes to the system channel variant when the declared kind is system', async () => {
    rootAuth();
    aiproxyMocks.systemGet.mockResolvedValue(systemChannel(12));

    const res = await Call(updateHandler, { body: systemUpdateBody });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.systemUpdate).toHaveBeenCalledWith(12, expect.anything());
    expect(aiproxyMocks.groupUpdate).not.toHaveBeenCalled();
  });

  it('member declaring channelType=system is rejected (system channels are root-only)', async () => {
    memberWithCreatePer();

    const res = await Call(updateHandler, { body: systemUpdateBody });

    expect(res.code).toBe(500);
    expect(res.error).toBe('rootOnlyPermit');
    expect(aiproxyMocks.systemUpdate).not.toHaveBeenCalled();
    expect(aiproxyMocks.groupUpdate).not.toHaveBeenCalled();
  });

  it('root team-kind resolves the member channel via the global single-fetch', async () => {
    rootAuth();
    aiproxyMocks.globalGroupGet.mockResolvedValue(groupChannel(12, 'fastgpt:tmb:otherMember'));

    const res = await Call(updateHandler, { body: updateBody });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.group).toHaveBeenCalledWith('fastgpt:tmb:otherMember');
    expect(aiproxyMocks.groupUpdate).toHaveBeenCalledWith(12, expect.anything());
  });
});

describe('existing channel operations after create permission is revoked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberWithoutCreatePer();
    aiproxyMocks.groupGet.mockResolvedValue(groupChannel(12, GROUP_ID));
    vi.mocked(getChannelAffectedModels).mockResolvedValue([]);
  });

  it('allows deleting an existing own channel', async () => {
    const res = await Call(deleteHandler, { query: { id: 12, channelType: 'team' } });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.group).toHaveBeenCalledWith(GROUP_ID);
    expect(aiproxyMocks.groupDelete).toHaveBeenCalledWith(12);
  });

  it('allows changing status of an existing own channel', async () => {
    const res = await Call(statusHandler, {
      body: { id: 12, channelType: 'team', status: 2 }
    });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.group).toHaveBeenCalledWith(GROUP_ID);
    expect(aiproxyMocks.groupUpdateStatus).toHaveBeenCalledWith(12, 2);
  });

  it('allows reading affected models of an existing own channel', async () => {
    const res = await Call(affectedModelsHandler, {
      query: { id: 12, channelType: 'team' }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(getChannelAffectedModels)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, group_id: GROUP_ID })
    );
  });

  it('allows reading affected models of multiple existing own channels', async () => {
    vi.mocked(getBatchChannelsAffectedModels).mockResolvedValue([
      { modelId: 'm1', name: 'M1', model: 'gpt-4o' }
    ]);

    const res = await Call(affectedModelsHandler, {
      query: { ids: [12, 13], channelType: 'team' }
    });

    expect(res.code).toBe(200);
    expect(res.data?.affectedModels).toHaveLength(1);
    expect(vi.mocked(getBatchChannelsAffectedModels)).toHaveBeenCalled();
  });
});

describe('GET /api/core/ai/channel/models (related models for hover)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('member fetches models of an own-group channel', async () => {
    memberWithCreatePer();
    aiproxyMocks.groupGet.mockResolvedValue(groupChannel(12, GROUP_ID));
    vi.mocked(getChannelModels).mockReturnValue([
      { modelId: 'm1', name: 'Model 1', model: 'gpt-4o' }
    ]);

    const res = await Call(modelsHandler, { query: { id: 12, channelType: 'team' } });

    expect(res.code).toBe(200);
    expect(res.data.models).toEqual([{ modelId: 'm1', name: 'Model 1', model: 'gpt-4o' }]);
    expect(vi.mocked(getChannelModels)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, group_id: GROUP_ID })
    );
  });

  it('member operating a channel outside own group rejects channelNotExist', async () => {
    memberWithCreatePer();
    aiproxyMocks.groupGet.mockRejectedValue({ response: { status: 404 } });

    const res = await Call(modelsHandler, { query: { id: 99, channelType: 'team' } });

    expect(res.code).toBe(500);
    expect(res.error).toBe('channelNotExist');
    expect(vi.mocked(getChannelModels)).not.toHaveBeenCalled();
  });

  it('root fetches models of a system channel', async () => {
    rootAuth();
    aiproxyMocks.systemGet.mockResolvedValue(systemChannel(12));
    vi.mocked(getChannelModels).mockReturnValue([
      { modelId: 'm2', name: 'Model 2', model: 'claude-3-5-sonnet' }
    ]);

    const res = await Call(modelsHandler, { query: { id: 12, channelType: 'system' } });

    expect(res.code).toBe(200);
    expect(res.data.models).toHaveLength(1);
    expect(vi.mocked(getChannelModels)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, group_id: undefined })
    );
  });
});

describe('POST /api/core/ai/channel/batch (batch operations)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('member batch-deletes own channels and gets affected models', async () => {
    memberWithCreatePer();
    aiproxyMocks.groupGet.mockImplementation(async (id) => groupChannel(id, GROUP_ID));
    vi.mocked(getBatchChannelsAffectedModels).mockResolvedValue([
      { modelId: 'm1', name: 'Model 1', model: 'gpt-4o' }
    ]);

    const res = await Call(batchHandler, {
      body: { action: 'delete', ids: [1, 2], channelType: 'team' }
    });

    expect(res.code).toBe(200);
    expect(res.data.affectedModels).toEqual([{ modelId: 'm1', name: 'Model 1', model: 'gpt-4o' }]);
    expect(aiproxyMocks.group).toHaveBeenCalledWith(GROUP_ID);
    expect(aiproxyMocks.groupBatchDelete).toHaveBeenCalledWith([1, 2]);
  });

  it('member batch-updates status of own channels', async () => {
    memberWithCreatePer();
    aiproxyMocks.groupGet.mockImplementation(async (id) => groupChannel(id, GROUP_ID));

    const res = await Call(batchHandler, {
      body: { action: 'status', ids: [1, 2], status: 2, channelType: 'team' }
    });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.group).toHaveBeenCalledWith(GROUP_ID);
    expect(aiproxyMocks.groupBatchUpdateStatus).toHaveBeenCalledWith([1, 2], 2);
  });

  it('non-root batch operation on system channels is rejected', async () => {
    memberWithCreatePer();

    const res = await Call(batchHandler, {
      body: { action: 'delete', ids: [1, 2], channelType: 'system' }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('rootOnlyPermit');
    expect(aiproxyMocks.systemBatchDelete).not.toHaveBeenCalled();
  });

  it('root batch-deletes system channels', async () => {
    rootAuth();
    aiproxyMocks.systemGet.mockImplementation(async (id) => systemChannel(id));
    vi.mocked(getBatchChannelsAffectedModels).mockResolvedValue([]);

    const res = await Call(batchHandler, {
      body: { action: 'delete', ids: [10, 20], channelType: 'system' }
    });

    expect(res.code).toBe(200);
    expect(aiproxyMocks.systemBatchDelete).toHaveBeenCalledWith([10, 20]);
  });
});
