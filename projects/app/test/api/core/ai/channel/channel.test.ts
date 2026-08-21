import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  createGroupChannel,
  createSystemChannel,
  deleteGroupChannel,
  getChannelModels,
  getChannelAffectedModels,
  getChannelTypeMetas,
  getGlobalGroupChannelById,
  getGroupChannelById,
  getSystemChannelById,
  getGlobalGroupChannelList,
  getMemberChannelList,
  getSystemChannelList,
  updateGroupChannel,
  updateGroupChannelStatus,
  updateSystemChannel,
  testGroupChannel,
  type AiproxyGroupChannel
} from '@fastgpt/service/core/ai/channel';
import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/channel/api';
import { getCachedTypeMetas, resetChannelCache } from '@fastgpt/service/core/ai/channel/cache';
import { Call } from '@test/utils/request';
import listHandler from '@/pages/api/core/ai/channel/list';
import createHandler from '@/pages/api/core/ai/channel/create';
import updateHandler from '@/pages/api/core/ai/channel/update';
import deleteHandler from '@/pages/api/core/ai/channel/delete';
import statusHandler from '@/pages/api/core/ai/channel/status';
import testHandler from '@/pages/api/core/ai/channel/test';
import affectedModelsHandler from '@/pages/api/core/ai/channel/affectedModels';
import modelsHandler from '@/pages/api/core/ai/channel/models';
import providerMetasHandler from '@/pages/api/core/ai/channel/providerMetas';

// Mock the aiproxy-facing service layer so no real aiproxy call happens.
// The real controller helpers (assertMemberChannelPermission etc.) stay intact.
vi.mock('@fastgpt/service/core/ai/channel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/channel')>();
  return {
    ...actual,
    listGroupChannels: vi.fn(),
    listSystemChannels: vi.fn(),
    listGlobalGroupChannels: vi.fn(),
    getGroupChannelById: vi.fn(),
    getSystemChannelById: vi.fn(),
    getGlobalGroupChannelById: vi.fn(),
    createGroupChannel: vi.fn(),
    createSystemChannel: vi.fn(),
    updateGroupChannel: vi.fn(),
    updateSystemChannel: vi.fn(),
    deleteGroupChannel: vi.fn(),
    deleteSystemChannel: vi.fn(),
    updateGroupChannelStatus: vi.fn(),
    updateSystemChannelStatus: vi.fn(),
    testGroupChannel: vi.fn(),
    testSystemChannel: vi.fn(),
    getChannelAffectedModels: vi.fn(),
    getChannelModels: vi.fn(),
    getSystemChannelList: vi.fn(),
    getMemberChannelList: vi.fn(),
    getGlobalGroupChannelList: vi.fn(),
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

  it('root with groupType=team only gets the root own-channel view', async () => {
    rootAuth();
    vi.mocked(getMemberChannelList).mockResolvedValue({
      list: [channelItem(5, 1)],
      total: 1
    });

    const res = await Call(listHandler, { query: { groupType: 'team' } });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(1);
    expect(vi.mocked(getMemberChannelList)).toHaveBeenCalledWith({
      tmbId: TMB_ID,
      pageNum: undefined,
      pageSize: undefined
    });
    expect(vi.mocked(getGlobalGroupChannelList)).not.toHaveBeenCalled();
  });
});

describe('POST /api/core/ai/channel/create (groupType declared by caller)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('member declares groupType=team → creates in own group (groupId derived from session)', async () => {
    memberWithCreatePer();

    const res = await Call(createHandler, {
      body: { groupType: 'team', name: 'my channel', type: 1, key: 'key', models: ['gpt-4o'] }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(createGroupChannel)).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({ name: 'my channel' })
    );
    expect(vi.mocked(createSystemChannel)).not.toHaveBeenCalled();
  });

  it('member without create permission is rejected with unAuthChannel', async () => {
    memberWithoutCreatePer();

    const res = await Call(createHandler, {
      body: { groupType: 'team', name: 'my channel', type: 1, key: 'key', models: ['gpt-4o'] }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('unAuthChannel');
    expect(vi.mocked(createGroupChannel)).not.toHaveBeenCalled();
    expect(vi.mocked(createSystemChannel)).not.toHaveBeenCalled();
  });

  it('member declaring groupType=system is rejected (system channels are root-only)', async () => {
    memberWithCreatePer();

    const res = await Call(createHandler, {
      body: { groupType: 'system', name: 'my channel', type: 1, key: 'key', models: ['gpt-4o'] }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('rootOnlyPermit');
    expect(vi.mocked(createSystemChannel)).not.toHaveBeenCalled();
    expect(vi.mocked(createGroupChannel)).not.toHaveBeenCalled();
  });

  it('root declaring groupType=system creates a system channel', async () => {
    rootAuth();

    const res = await Call(createHandler, {
      body: { groupType: 'system', name: 'system channel', type: 1, key: 'key', models: ['gpt-4o'] }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(createSystemChannel)).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'system channel' })
    );
    expect(vi.mocked(createGroupChannel)).not.toHaveBeenCalled();
  });

  it('root declaring groupType=team creates in root own team group (root is also a team admin)', async () => {
    rootAuth();

    const res = await Call(createHandler, {
      body: {
        groupType: 'team',
        name: 'root team channel',
        type: 1,
        key: 'key',
        models: ['gpt-4o']
      }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(createGroupChannel)).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({ name: 'root team channel' })
    );
    expect(vi.mocked(createSystemChannel)).not.toHaveBeenCalled();
  });
});

describe('getCachedTypeMetas (TTL cache for provider metas)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'));
    resetChannelCache();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const fetchFn = () =>
    vi.fn().mockResolvedValue({
      1: { defaultBaseUrl: 'https://a', keyHelp: 'sk-', name: 'a' }
    });

  it('reuses the cached metas within the 10-min TTL window', async () => {
    const fetch = fetchFn();

    const first = await getCachedTypeMetas(fetch);
    vi.setSystemTime(new Date('2026-08-12T00:05:00Z'));
    const second = await getCachedTypeMetas(fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('refetches after the TTL expires', async () => {
    const fetch = fetchFn();

    await getCachedTypeMetas(fetch);
    vi.setSystemTime(new Date('2026-08-12T00:11:00Z'));
    await getCachedTypeMetas(fetch);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent cold misses into a single fetch', async () => {
    const fetch = fetchFn();

    const [a, b] = await Promise.all([getCachedTypeMetas(fetch), getCachedTypeMetas(fetch)]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
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
    vi.mocked(getGroupChannelById).mockResolvedValue(groupChannel(12, GROUP_ID));

    const res = await Call(updateHandler, { body: updateBody });

    expect(res.code).toBe(200);
    expect(vi.mocked(updateGroupChannel)).toHaveBeenCalledWith(
      GROUP_ID,
      12,
      expect.objectContaining({ name: 'new name' })
    );
  });

  it('member routes to the own group channel variant when the id is in own group', async () => {
    memberWithCreatePer();
    vi.mocked(getGroupChannelById).mockResolvedValue(groupChannel(12, GROUP_ID));

    const res = await Call(updateHandler, { body: updateBody });

    expect(res.code).toBe(200);
    expect(vi.mocked(updateGroupChannel)).toHaveBeenCalledWith(
      GROUP_ID,
      12,
      expect.objectContaining({ name: 'new name' })
    );
    expect(vi.mocked(updateSystemChannel)).not.toHaveBeenCalled();
  });

  it('member operating an id outside own group rejects channelNotExist', async () => {
    memberWithCreatePer();
    vi.mocked(getGroupChannelById).mockRejectedValue({ response: { status: 404 } });

    const res = await Call(updateHandler, { body: { ...updateBody, id: 99 } });

    expect(res.code).toBe(500);
    expect(res.error).toBe('channelNotExist');
    expect(vi.mocked(updateGroupChannel)).not.toHaveBeenCalled();
    expect(vi.mocked(updateSystemChannel)).not.toHaveBeenCalled();
  });

  it('update rejects a partial payload (PUT is a full replacement)', async () => {
    memberWithCreatePer();
    vi.mocked(getGroupChannelById).mockResolvedValue(groupChannel(12, GROUP_ID));

    const res = await Call(updateHandler, {
      body: { id: 12, channelType: 'team', name: 'only name' }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('invalidModelConfig');
    expect(vi.mocked(updateGroupChannel)).not.toHaveBeenCalled();
  });

  it('root routes to the system channel variant when the declared kind is system', async () => {
    rootAuth();
    vi.mocked(getSystemChannelById).mockResolvedValue(systemChannel(12));

    const res = await Call(updateHandler, { body: systemUpdateBody });

    expect(res.code).toBe(200);
    expect(vi.mocked(updateSystemChannel)).toHaveBeenCalledWith(12, expect.anything());
    expect(vi.mocked(updateGroupChannel)).not.toHaveBeenCalled();
  });

  it('member declaring channelType=system is rejected (system channels are root-only)', async () => {
    memberWithCreatePer();

    const res = await Call(updateHandler, { body: systemUpdateBody });

    expect(res.code).toBe(500);
    expect(res.error).toBe('rootOnlyPermit');
    expect(vi.mocked(updateSystemChannel)).not.toHaveBeenCalled();
    expect(vi.mocked(updateGroupChannel)).not.toHaveBeenCalled();
  });

  it('root team-kind resolves the member channel via the global single-fetch', async () => {
    rootAuth();
    vi.mocked(getGlobalGroupChannelById).mockResolvedValue(
      groupChannel(12, 'fastgpt:tmb:otherMember')
    );

    const res = await Call(updateHandler, { body: updateBody });

    expect(res.code).toBe(200);
    expect(vi.mocked(updateGroupChannel)).toHaveBeenCalledWith(
      'fastgpt:tmb:otherMember',
      12,
      expect.anything()
    );
  });
});

describe('existing channel operations after create permission is revoked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberWithoutCreatePer();
    vi.mocked(getGroupChannelById).mockResolvedValue(groupChannel(12, GROUP_ID));
    vi.mocked(getChannelAffectedModels).mockResolvedValue([]);
  });

  it('allows deleting an existing own channel', async () => {
    const res = await Call(deleteHandler, { query: { id: 12, channelType: 'team' } });

    expect(res.code).toBe(200);
    expect(vi.mocked(deleteGroupChannel)).toHaveBeenCalledWith(GROUP_ID, 12);
  });

  it('allows changing status of an existing own channel', async () => {
    const res = await Call(statusHandler, {
      body: { id: 12, channelType: 'team', status: 2 }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(updateGroupChannelStatus)).toHaveBeenCalledWith(GROUP_ID, 12, 2);
  });

  it('allows testing an existing own channel', async () => {
    const res = await Call(testHandler, {
      query: { id: 12, channelType: 'team', model: 'gpt-4o' }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(testGroupChannel)).toHaveBeenCalledWith(GROUP_ID, 12, 'gpt-4o');
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
});

describe('GET /api/core/ai/channel/models (related models for hover)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('member fetches models of an own-group channel', async () => {
    memberWithCreatePer();
    vi.mocked(getGroupChannelById).mockResolvedValue(groupChannel(12, GROUP_ID));
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
    vi.mocked(getGroupChannelById).mockRejectedValue({ response: { status: 404 } });

    const res = await Call(modelsHandler, { query: { id: 99, channelType: 'team' } });

    expect(res.code).toBe(500);
    expect(res.error).toBe('channelNotExist');
    expect(vi.mocked(getChannelModels)).not.toHaveBeenCalled();
  });

  it('root fetches models of a system channel', async () => {
    rootAuth();
    vi.mocked(getSystemChannelById).mockResolvedValue(systemChannel(12));
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
