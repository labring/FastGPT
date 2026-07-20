import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/model/type';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

const { axiosMock, getConfigMock } = vi.hoisted(() => ({
  axiosMock: vi.fn(),
  getConfigMock: vi.fn(() => ({ baseUrl: 'http://aiproxy.test', token: 'test-token' }))
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: axiosMock
}));

vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: getConfigMock
}));

import {
  assertMemberChannelPermission,
  assertOwnGroupChannel,
  channelCount,
  getChannelAffectedModels,
  getChannelModels,
  getGlobalGroupChannelList,
  getMemberChannelList,
  getModelChannelRefs,
  getModelChannelsMapByModels,
  getSystemChannelList,
  normalizeAiproxyError
} from '@fastgpt/service/core/ai/channel/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { resetChannelCache } from '@fastgpt/service/core/ai/channel/cache';
import type { AiproxyChannel, AiproxyGroupChannel } from '@fastgpt/service/core/ai/channel/api';

const okEnvelope = (data: unknown) => ({ data: { success: true, data } });

const makeModel = (id: string, overrides: Partial<SystemModelItemType> = {}): SystemModelItemType =>
  ({
    type: 'llm',
    provider: 'test',
    model: 'gpt-4o',
    name: `Model ${id}`,
    isActive: true,
    isSystem: true,
    id,
    ...overrides
  }) as SystemModelItemType;

const makeChannel = (id: number, overrides: Partial<AiproxyChannel> = {}): AiproxyChannel => ({
  id,
  name: `ch-${id}`,
  type: 1,
  status: 1,
  models: [],
  ...overrides
});

const makeGroupChannel = (
  id: number,
  groupId: string,
  overrides: Partial<AiproxyGroupChannel> = {}
): AiproxyGroupChannel => ({
  ...makeChannel(id),
  group_id: groupId,
  ...overrides
});

/* ═══ Fixture ═══ */

const GROUP_A = encodeURIComponent('fastgpt:tmb:tmb-a');
const GROUP_B = encodeURIComponent('fastgpt:tmb:tmb-b');

const SYSTEM_CHANNELS: AiproxyChannel[] = [
  makeChannel(101, { name: 'Sys GPT', models: ['gpt-4o'] }),
  makeChannel(102, { name: 'Sys Claude', models: ['gpt-4o', 'claude-3-5-sonnet'] }),
  makeChannel(103, { name: 'Sys Embedding', models: ['text-embedding-3-small'] })
];
const GROUP_A_CHANNELS: AiproxyGroupChannel[] = [
  makeGroupChannel(201, 'fastgpt:tmb:tmb-a', { name: 'A Qwen', models: ['qwen-plus'] }),
  makeGroupChannel(202, 'fastgpt:tmb:tmb-a', { name: 'A DeepSeek', models: ['deepseek-v3'] })
];
const GROUP_B_CHANNELS: AiproxyGroupChannel[] = [
  makeGroupChannel(301, 'fastgpt:tmb:tmb-b', { name: 'B Qwen', models: ['qwen-plus'] })
];
const FOREIGN_CHANNELS: AiproxyGroupChannel[] = [
  makeGroupChannel(401, 'external:group-1', { name: 'Foreign', models: ['qwen-plus'] })
];

const setupModels = () => {
  const models: SystemModelItemType[] = [
    makeModel('sys-llm-1', { model: 'gpt-4o', name: 'Sys GPT-4o', isSystem: true }),
    makeModel('sys-llm-2', { model: 'claude-3-5-sonnet', name: 'Sys Claude', isSystem: true }),
    makeModel('sys-emb-1', {
      model: 'text-embedding-3-small',
      name: 'Sys Embedding',
      isSystem: true,
      type: ModelTypeEnum.embedding
    }),
    makeModel('own-a-1', {
      model: 'qwen-plus',
      name: 'A Qwen Plus',
      isSystem: false,
      tmbId: 'tmb-a',
      teamId: 'team-a'
    }),
    makeModel('own-a-2', {
      model: 'deepseek-v3',
      name: 'A DeepSeek V3',
      isSystem: false,
      tmbId: 'tmb-a',
      teamId: 'team-a'
    }),
    makeModel('own-b-1', {
      model: 'qwen-plus',
      name: 'B Qwen Plus',
      isSystem: false,
      tmbId: 'tmb-b',
      teamId: 'team-b'
    })
  ];
  globalThis.systemModelList = models;
  globalThis.systemModelIdMap = new Map(models.map((m) => [m.id, m]));
};

const mockChannels = () => {
  axiosMock.mockImplementation((config: { url: string }) => {
    const url = config.url;
    if (url.startsWith('http://aiproxy.test/api/channels/')) {
      return Promise.resolve(
        okEnvelope({ channels: SYSTEM_CHANNELS, total: SYSTEM_CHANNELS.length })
      );
    }
    if (url.startsWith('http://aiproxy.test/api/group_channels/')) {
      return Promise.resolve(
        okEnvelope({
          channels: [...GROUP_A_CHANNELS, ...GROUP_B_CHANNELS, ...FOREIGN_CHANNELS],
          total: 4
        })
      );
    }
    if (url.startsWith(`http://aiproxy.test/api/group/${GROUP_A}/channels/`)) {
      return Promise.resolve(
        okEnvelope({ channels: GROUP_A_CHANNELS, total: GROUP_A_CHANNELS.length })
      );
    }
    if (url.startsWith(`http://aiproxy.test/api/group/${GROUP_B}/channels/`)) {
      return Promise.resolve(
        okEnvelope({ channels: GROUP_B_CHANNELS, total: GROUP_B_CHANNELS.length })
      );
    }
    return Promise.reject(new Error(`unmocked url: ${url}`));
  });
};

describe('channel controller — owner-paired association', () => {
  beforeEach(() => {
    setupModels();
    mockChannels();
    resetChannelCache();
  });

  it('getModelChannelsMapByModels pairs each model against its OWN bucket (multi-owner set)', async () => {
    const map = await getModelChannelsMapByModels([
      globalThis.systemModelList.find((m) => m.id === 'sys-llm-1')!,
      globalThis.systemModelList.find((m) => m.id === 'own-a-1')!,
      globalThis.systemModelList.find((m) => m.id === 'own-b-1')!
    ]);

    // System bucket
    expect(map.get('sys-llm-1')).toEqual([
      { id: 101, name: 'Sys GPT', status: 1 },
      { id: 102, name: 'Sys Claude', status: 1 }
    ]);

    // Each owner counts against their own group channels only
    expect(map.get('own-a-1')).toEqual([{ id: 201, name: 'A Qwen', status: 1 }]);
    expect(map.get('own-b-1')).toEqual([{ id: 301, name: 'B Qwen', status: 1 }]);

    // Cross-owner isolation: member B's channels never pair with A's models
    expect(map.size).toBe(3);
  });

  it('getModelChannelsMapByModels with a system-only set skips group fetches', async () => {
    const map = await getModelChannelsMapByModels([
      globalThis.systemModelList.find((m) => m.id === 'sys-llm-1')!,
      globalThis.systemModelList.find((m) => m.id === 'sys-emb-1')!
    ]);
    expect(map.get('sys-llm-1')?.length).toBe(2);
    expect(map.get('sys-emb-1')?.length).toBe(1);
    expect(map.size).toBe(2);
  });

  it('channelCount returns the matched channel count per bucket', async () => {
    const map = await getModelChannelsMapByModels(globalThis.systemModelList);
    expect(channelCount('sys-llm-1', map)).toBe(2);
    expect(channelCount('sys-emb-1', map)).toBe(1);
    expect(channelCount('own-a-1', map)).toBe(1);
    expect(channelCount('unknown-id', map)).toBe(0);
  });
});

describe('channel controller — delete protection / refs', () => {
  beforeEach(() => {
    setupModels();
    mockChannels();
    resetChannelCache();
  });

  it('getChannelAffectedModels keeps models served by exactly one channel of the bucket', async () => {
    // text-embedding-3-small is only on ch-sys-3 → affected
    const sysAffected = await getChannelAffectedModels(SYSTEM_CHANNELS[2]);
    expect(sysAffected).toEqual([
      { modelId: 'sys-emb-1', name: 'Sys Embedding', model: 'text-embedding-3-small' }
    ]);

    // gpt-4o is on two system channels → not affected
    const sysSafe = await getChannelAffectedModels(SYSTEM_CHANNELS[0]);
    expect(sysSafe).toEqual([]);
  });

  it('group bucket counts ignore other members channels (route scope isolation)', async () => {
    // qwen-plus appears once within group A (ch-b-1 is another owner's bucket)
    const aAffected = await getChannelAffectedModels(GROUP_A_CHANNELS[0]);
    expect(aAffected).toEqual([{ modelId: 'own-a-1', name: 'A Qwen Plus', model: 'qwen-plus' }]);

    const bAffected = await getChannelAffectedModels(GROUP_B_CHANNELS[0]);
    expect(bAffected).toEqual([{ modelId: 'own-b-1', name: 'B Qwen Plus', model: 'qwen-plus' }]);
  });

  it('getChannelModels returns ALL bucket models matched by upstream name (no only-channel filter)', () => {
    // gpt-4o is on two system channels → affectedModels is empty, models lists it
    expect(getChannelModels(SYSTEM_CHANNELS[0])).toEqual([
      { modelId: 'sys-llm-1', name: 'Sys GPT-4o', model: 'gpt-4o' }
    ]);
    expect(getChannelModels(SYSTEM_CHANNELS[1])).toEqual([
      { modelId: 'sys-llm-1', name: 'Sys GPT-4o', model: 'gpt-4o' },
      { modelId: 'sys-llm-2', name: 'Sys Claude', model: 'claude-3-5-sonnet' }
    ]);
    // Owner bucket only counts the owner's models
    expect(getChannelModels(GROUP_A_CHANNELS[0])).toEqual([
      { modelId: 'own-a-1', name: 'A Qwen Plus', model: 'qwen-plus' }
    ]);
    // Foreign group channels have no FastGPT models to associate
    expect(getChannelModels(FOREIGN_CHANNELS[0])).toEqual([]);
  });

  it('channels of foreign groups have no FastGPT models to associate', async () => {
    expect(await getChannelAffectedModels(FOREIGN_CHANNELS[0])).toEqual([]);
  });

  it('getModelChannelRefs counts same-bucket channels serving the same upstream name', async () => {
    const sysModel = globalThis.systemModelList.find((m) => m.id === 'sys-llm-1')!;
    const ownA = globalThis.systemModelList.find((m) => m.id === 'own-a-1')!;
    const ownB = globalThis.systemModelList.find((m) => m.id === 'own-b-1')!;

    expect(await getModelChannelRefs(sysModel)).toBe(2); // ch-sys-1 + ch-sys-2
    expect(await getModelChannelRefs(ownA)).toBe(1); // only ch-a-1, not ch-b-1
    expect(await getModelChannelRefs(ownB)).toBe(1); // only ch-b-1
  });
});

describe('channel controller — permission helpers', () => {
  it('assertMemberChannelPermission requires TeamModelCreatePermissionVal', async () => {
    await expect(
      assertMemberChannelPermission({ hasModelCreatePer: false } as TeamPermission)
    ).rejects.toBe(ModelErrEnum.unAuthChannel);
    await expect(
      assertMemberChannelPermission({ hasModelCreatePer: true } as TeamPermission)
    ).resolves.toBeUndefined();
  });

  it('assertOwnGroupChannel only allows the member own group channels', async () => {
    const aChannel = GROUP_A_CHANNELS[0];
    await expect(assertOwnGroupChannel(aChannel, 'tmb-a')).resolves.toBeUndefined();
    await expect(assertOwnGroupChannel(aChannel, 'tmb-b')).rejects.toBe(ModelErrEnum.unAuthChannel);
  });
});

describe('channel controller — error normalization', () => {
  it('maps aiproxy HTTP errors to ModelErrEnum', () => {
    expect(normalizeAiproxyError({ response: { status: 404 } })).toBe(ModelErrEnum.channelNotExist);
    expect(normalizeAiproxyError({ response: { status: 401 } })).toBe(ModelErrEnum.unAuthChannel);
    expect(normalizeAiproxyError({ response: { status: 403 } })).toBe(ModelErrEnum.unAuthChannel);
    // aiproxy single-fetch endpoints return 500 + gorm "record not found" for missing ids
    expect(
      normalizeAiproxyError({ response: { status: 500, data: { message: 'record not found' } } })
    ).toBe(ModelErrEnum.channelNotExist);
    // other 500s stay business errors
    expect(
      normalizeAiproxyError({ response: { status: 500, data: { message: 'boom' } } })
    ).not.toBe(ModelErrEnum.channelNotExist);
  });

  it('preserves business messages (e.g. invalid key) and plain errors', () => {
    expect(normalizeAiproxyError(new Error('invalid key'))).toBe('invalid key');
    expect(normalizeAiproxyError('plain failure')).toBe('plain failure');
  });

  it('controller functions reject with the normalized error', async () => {
    resetChannelCache(); // drop any buckets warmed by earlier tests
    axiosMock.mockRejectedValue({ response: { status: 404 } });
    await expect(getSystemChannelList()).rejects.toBe(ModelErrEnum.channelNotExist);
  });
});

describe('channel controller — list views with relatedModelCount', () => {
  beforeEach(() => {
    setupModels();
    mockChannels();
    // Creator resolution hits MongoTeamMember; default to an empty member set so
    // unrelated tests stay deterministic (sourceMember assertions live in their own test).
    vi.spyOn(MongoTeamMember, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    } as any);
  });

  it('system channel view counts the system model bucket', async () => {
    const { list, total } = await getSystemChannelList();
    expect(total).toBe(3);
    expect(list.find((c) => c.id === 101)?.relatedModelCount).toBe(1);
    expect(list.find((c) => c.id === 102)?.relatedModelCount).toBe(2);
    expect(list.find((c) => c.id === 103)?.relatedModelCount).toBe(1);
    expect(list.find((c) => c.id === 101)?.group_id).toBeUndefined();
  });

  it('member channel view counts the owner bucket', async () => {
    const { list, total } = await getMemberChannelList({ tmbId: 'tmb-a' });
    expect(total).toBe(2);
    expect(list.find((c) => c.id === 201)?.relatedModelCount).toBe(1);
    expect(list.find((c) => c.id === 202)?.relatedModelCount).toBe(1);
    expect(list.find((c) => c.id === 201)?.group_id).toBe('fastgpt:tmb:tmb-a');
  });

  it('global view counts per-owner buckets; foreign groups get 0', async () => {
    const { list, total } = await getGlobalGroupChannelList();
    expect(total).toBe(4);
    expect(list.find((c) => c.id === 201)?.relatedModelCount).toBe(1);
    expect(list.find((c) => c.id === 301)?.relatedModelCount).toBe(1);
    expect(list.find((c) => c.id === 401)?.relatedModelCount).toBe(0);
  });

  it('global view resolves creator info (sourceMember) for FastGPT group ids', async () => {
    vi.spyOn(MongoTeamMember, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'tmb-a', name: 'User A', avatar: 'avatar-a', status: 'active' },
        { _id: 'tmb-b', name: 'User B' }
      ])
    } as any);

    const { list } = await getGlobalGroupChannelList();
    expect(list.find((c) => c.id === 201)?.sourceMember).toMatchObject({
      name: 'User A',
      avatar: 'avatar-a',
      status: 'active'
    });
    expect(list.find((c) => c.id === 301)?.sourceMember?.name).toBe('User B');
    // Foreign group ids are not FastGPT tmb ids → no creator info
    expect(list.find((c) => c.id === 401)?.sourceMember).toBeUndefined();
  });

  it('applies pagination', async () => {
    const { list, total } = await getSystemChannelList({ pageNum: 2, pageSize: 2 });
    expect(total).toBe(3);
    expect(list.map((c) => c.id)).toEqual([103]);
  });

  it('tolerates a null aiproxy channels payload instead of a "not iterable" 500', async () => {
    // Regression: aiproxy may return data.channels: null (Go nil slice → JSON
    // null) for an empty/degraded bucket — the list must fail open to an empty
    // page, not throw "X is not iterable" on the spread.
    resetChannelCache();
    axiosMock.mockResolvedValue(okEnvelope({ channels: null, total: 0 }));

    const { list, total } = await getSystemChannelList();
    expect(total).toBe(0);
    expect(list).toEqual([]);

    axiosMock.mockClear();
    axiosMock.mockResolvedValue(okEnvelope({ channels: null, total: 1 }));
    const member = await getMemberChannelList({ tmbId: 'tmb-a' });
    expect(member.total).toBe(0);
    expect(member.list).toEqual([]);
  });
});
