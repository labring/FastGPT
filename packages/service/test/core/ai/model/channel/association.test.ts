import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  clearTeamModelCatalogCache,
  publishSystemModelHandle
} from '@fastgpt/service/core/ai/model/catalog/cache';
import { createModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosMock, getConfigMock, getTeamModelHandleMock } = vi.hoisted(() => ({
  axiosMock: vi.fn(),
  getConfigMock: vi.fn(() => ({ baseUrl: 'http://aiproxy.test', token: 'test-token' })),
  getTeamModelHandleMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: axiosMock
}));

vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: getConfigMock
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()),
  getTeamModelHandle: getTeamModelHandleMock
}));

import {
  getChannelModels,
  getChannelsAffectedModels,
  getSystemAssociableModels
} from '@fastgpt/service/core/ai/model/channel/association';
import { resetChannelCache } from '@fastgpt/service/core/ai/model/channel/cache';
import {
  getMemberChannelList,
  getSystemChannelList
} from '@fastgpt/service/core/ai/model/channel/list';
import { resolveChannelForOperation } from '@fastgpt/service/core/ai/model/channel/resolve';
import type {
  AiproxyChannel,
  AiproxyGroupChannel
} from '@fastgpt/service/thirdProvider/aiproxy/type';

const okEnvelope = (data: unknown) => ({ data: { success: true, data } });

const makeModel = (id: string, overrides: Record<string, any> = {}): any => ({
  _id: id,
  modelId: id,
  type: ModelTypeEnum.llm,
  provider: 'test',
  model: 'gpt-4o',
  name: `Model ${id}`,
  isActive: true,
  scope: ModelScopeEnum.system,
  config: { maxContext: 16000, maxResponse: 4000, quoteMaxToken: 2000 },
  ...overrides
});

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

const TMB_A = '60000000000000000000000a';
const TMB_B = '60000000000000000000000b';

const GROUP_A = encodeURIComponent(`fastgpt:tmb:${TMB_A}`);
const GROUP_B = encodeURIComponent(`fastgpt:tmb:${TMB_B}`);
const TEAM_ID = '6000000000000000000000aa';
const SYSTEM_SCOPE = { channelType: 'system' as const, teamId: TEAM_ID, tmbId: TMB_A };
const GROUP_A_SCOPE = { channelType: 'team' as const, teamId: TEAM_ID, tmbId: TMB_A };
const GROUP_B_SCOPE = { channelType: 'team' as const, teamId: TEAM_ID, tmbId: TMB_B };

const SYSTEM_CHANNELS: AiproxyChannel[] = [
  makeChannel(101, { name: 'Sys GPT', models: ['gpt-4o'] }),
  makeChannel(102, { name: 'Sys Claude', models: ['gpt-4o', 'claude-3-5-sonnet'] }),
  makeChannel(103, { name: 'Sys Embedding', models: ['text-embedding-3-small'] })
];
const GROUP_A_CHANNELS: AiproxyGroupChannel[] = [
  makeGroupChannel(201, `fastgpt:tmb:${TMB_A}`, { name: 'A Qwen', models: ['qwen-plus'] }),
  makeGroupChannel(202, `fastgpt:tmb:${TMB_A}`, { name: 'A DeepSeek', models: ['deepseek-v3'] })
];
const GROUP_B_CHANNELS: AiproxyGroupChannel[] = [
  makeGroupChannel(301, `fastgpt:tmb:${TMB_B}`, { name: 'B Qwen', models: ['qwen-plus'] })
];
let testModels: Array<{
  id: string;
  model: string;
  name: string;
  isSystem: boolean;
  tmbId?: string;
}> = [];

const setupModels = () => {
  const models = [
    makeModel('sys-llm-1', { model: 'gpt-4o', name: 'Sys GPT-4o', scope: ModelScopeEnum.system }),
    makeModel('sys-llm-2', {
      model: 'claude-3-5-sonnet',
      name: 'Sys Claude',
      scope: ModelScopeEnum.system
    }),
    makeModel('sys-emb-1', {
      model: 'text-embedding-3-small',
      name: 'Sys Embedding',
      scope: ModelScopeEnum.system,
      type: ModelTypeEnum.embedding
    }),
    makeModel('own-a-1', {
      model: 'qwen-plus',
      name: 'A Qwen Plus',
      scope: ModelScopeEnum.team,
      tmbId: TMB_A,
      teamId: '6000000000000000000000aa'
    }),
    makeModel('own-a-2', {
      model: 'deepseek-v3',
      name: 'A DeepSeek V3',
      scope: ModelScopeEnum.team,
      tmbId: TMB_A,
      teamId: '6000000000000000000000aa'
    }),
    makeModel('own-b-1', {
      model: 'qwen-plus',
      name: 'B Qwen Plus',
      scope: ModelScopeEnum.team,
      tmbId: TMB_B,
      teamId: '6000000000000000000000bb'
    })
  ];
  testModels = models.map((m) => ({
    id: m.modelId,
    model: m.model,
    name: m.name,
    isSystem: m.scope === ModelScopeEnum.system,
    tmbId: m.tmbId
  }));
  publishSystemModelHandle(
    createModelHandle({
      models: models as any,
      defaultModels: {} as any,
      configuredDefaultModelIds: {} as any,
      revision: 1,
      version: '1'
    })
  );

  getTeamModelHandleMock.mockImplementation(async () => ({
    getTeamModels: (tmbId: string) =>
      testModels
        .filter((m) => !m.isSystem && m.tmbId === tmbId)
        .map((m) => ({
          modelId: m.id,
          model: m.model,
          name: m.name,
          type: ModelTypeEnum.llm,
          provider: 'test',
          scope: ModelScopeEnum.team,
          isSystem: false,
          tmbId: m.tmbId,
          isActive: true,
          config: { maxContext: 16000, maxResponse: 4000, quoteMaxToken: 2000 }
        }))
  }));
};

const mockChannels = () => {
  axiosMock.mockImplementation((config: { url: string }) => {
    const parsedUrl = new URL(config.url);
    const page = Number(parsedUrl.searchParams.get('page') || '1');
    const perPage = Number(parsedUrl.searchParams.get('per_page') || '100');
    const paginate = <T>(arr: T[]) => ({
      channels: arr.slice((page - 1) * perPage, page * perPage),
      total: arr.length
    });

    if (parsedUrl.pathname.startsWith('/api/channels/')) {
      return Promise.resolve(okEnvelope(paginate(SYSTEM_CHANNELS)));
    }
    if (parsedUrl.pathname.startsWith(`/api/group/${GROUP_A}/channels/`)) {
      return Promise.resolve(okEnvelope(paginate(GROUP_A_CHANNELS)));
    }
    if (parsedUrl.pathname.startsWith(`/api/group/${GROUP_B}/channels/`)) {
      return Promise.resolve(okEnvelope(paginate(GROUP_B_CHANNELS)));
    }
    return Promise.reject(new Error(`unmocked url: ${config.url}`));
  });
};

describe('channel controller — delete protection / refs', () => {
  beforeEach(() => {
    clearTeamModelCatalogCache();
    setupModels();
    mockChannels();
    resetChannelCache();
  });

  it('getChannelsAffectedModels keeps models served by exactly one channel of the bucket', async () => {
    // text-embedding-3-small is only on ch-sys-3 → affected
    const sysAffected = await getChannelsAffectedModels({
      channels: [SYSTEM_CHANNELS[2]],
      ...SYSTEM_SCOPE
    });
    expect(sysAffected).toEqual([
      { modelId: 'sys-emb-1', name: 'Sys Embedding', model: 'text-embedding-3-small' }
    ]);

    // gpt-4o is on two system channels → not affected
    const sysSafe = await getChannelsAffectedModels({
      channels: [SYSTEM_CHANNELS[0]],
      ...SYSTEM_SCOPE
    });
    expect(sysSafe).toEqual([]);

    // When both channels providing gpt-4o are deleted together, gpt-4o is affected
    const batchAffected = await getChannelsAffectedModels({
      channels: [SYSTEM_CHANNELS[0], SYSTEM_CHANNELS[1]],
      ...SYSTEM_SCOPE
    });
    expect(batchAffected).toEqual([
      { modelId: 'sys-llm-1', name: 'Sys GPT-4o', model: 'gpt-4o' },
      { modelId: 'sys-llm-2', name: 'Sys Claude', model: 'claude-3-5-sonnet' }
    ]);
  });

  it('excludes self-contained system models with requestUrl from affected models', async () => {
    // Add a system model that has its own requestUrl
    const directModel = makeModel('sys-direct-1', {
      model: 'text-embedding-3-small',
      name: 'Sys Direct Embedding',
      scope: ModelScopeEnum.system,
      type: ModelTypeEnum.embedding
    });
    (directModel as any).requestUrl = 'http://localhost:8000/v1';

    publishSystemModelHandle(
      createModelHandle({
        models: [
          ...testModels.map((m) =>
            makeModel(m.id, {
              model: m.model,
              name: m.name,
              scope: m.isSystem ? ModelScopeEnum.system : ModelScopeEnum.team,
              tmbId: m.tmbId
            })
          ),
          directModel
        ] as any,
        defaultModels: {} as any,
        configuredDefaultModelIds: {} as any,
        revision: 2,
        version: '2'
      })
    );

    // SYSTEM_CHANNELS[2] serves 'text-embedding-3-small'.
    // If deleted, normal sys-emb-1 is affected, but sys-direct-1 is NOT affected.
    const affected = await getChannelsAffectedModels({
      channels: [SYSTEM_CHANNELS[2]],
      ...SYSTEM_SCOPE
    });
    expect(affected).toEqual([
      { modelId: 'sys-emb-1', name: 'Sys Embedding', model: 'text-embedding-3-small' }
    ]);
    expect(affected.find((m) => m.modelId === 'sys-direct-1')).toBeUndefined();
  });

  it('group bucket counts ignore other members channels (route scope isolation)', async () => {
    // qwen-plus appears once within group A (ch-b-1 is another owner's bucket)
    const aAffected = await getChannelsAffectedModels({
      channels: [GROUP_A_CHANNELS[0]],
      ...GROUP_A_SCOPE
    });
    expect(aAffected).toEqual([{ modelId: 'own-a-1', name: 'A Qwen Plus', model: 'qwen-plus' }]);

    const bAffected = await getChannelsAffectedModels({
      channels: [GROUP_B_CHANNELS[0]],
      ...GROUP_B_SCOPE
    });
    expect(bAffected).toEqual([{ modelId: 'own-b-1', name: 'B Qwen Plus', model: 'qwen-plus' }]);
  });

  it('getChannelModels returns ALL bucket models matched by upstream name (no only-channel filter)', async () => {
    // gpt-4o is on two system channels → affectedModels is empty, models lists it
    expect(await getChannelModels({ channel: SYSTEM_CHANNELS[0], ...SYSTEM_SCOPE })).toEqual([
      { modelId: 'sys-llm-1', name: 'Sys GPT-4o', model: 'gpt-4o' }
    ]);
    expect(await getChannelModels({ channel: SYSTEM_CHANNELS[1], ...SYSTEM_SCOPE })).toEqual([
      { modelId: 'sys-llm-1', name: 'Sys GPT-4o', model: 'gpt-4o' },
      { modelId: 'sys-llm-2', name: 'Sys Claude', model: 'claude-3-5-sonnet' }
    ]);
    // Owner bucket only counts the owner's models
    expect(await getChannelModels({ channel: GROUP_A_CHANNELS[0], ...GROUP_A_SCOPE })).toEqual([
      { modelId: 'own-a-1', name: 'A Qwen Plus', model: 'qwen-plus' }
    ]);
  });

  it('strictly isolates system associable models from team models with same model name', async () => {
    // Add a team model with the exact same upstream model name 'gpt-4o'
    const teamGpt = makeModel('own-a-gpt4o', {
      model: 'gpt-4o',
      name: 'A Private GPT-4o',
      scope: ModelScopeEnum.team,
      tmbId: TMB_A,
      teamId: 'team-a'
    });
    publishSystemModelHandle(
      createModelHandle({
        models: [
          ...testModels.map((m) =>
            makeModel(m.id, {
              model: m.model,
              name: m.name,
              scope: m.isSystem ? ModelScopeEnum.system : ModelScopeEnum.team,
              tmbId: m.tmbId
            })
          ),
          teamGpt
        ] as any,
        defaultModels: {} as any,
        configuredDefaultModelIds: {} as any,
        revision: 3,
        version: '3'
      })
    );

    const systemModels = await getSystemAssociableModels();
    expect(systemModels.some((m) => m.id === 'own-a-gpt4o')).toBe(false);

    // System channel 101 serves 'gpt-4o'. It should only pair with sys-llm-1, not own-a-gpt4o.
    const modelsOnSysChannel = await getChannelModels({
      channel: SYSTEM_CHANNELS[0],
      ...SYSTEM_SCOPE
    });
    expect(modelsOnSysChannel).toEqual([
      { modelId: 'sys-llm-1', name: 'Sys GPT-4o', model: 'gpt-4o' }
    ]);

    // Deleting system channels should not mark own-a-gpt4o as affected
    const batchAffected = await getChannelsAffectedModels({
      channels: [SYSTEM_CHANNELS[0], SYSTEM_CHANNELS[1]],
      ...SYSTEM_SCOPE
    });
    expect(batchAffected.some((m) => m.modelId === 'own-a-gpt4o')).toBe(false);
  });
});

describe('channel controller — 404 not found detection', () => {
  it('system channel list propagates underlying 404 error without translating to domain error', async () => {
    resetChannelCache(); // drop any buckets warmed by earlier tests
    const err404 = { response: { status: 404 } };
    axiosMock.mockRejectedValue(err404);
    await expect(getSystemChannelList()).rejects.toBe(err404);
  });

  it('resolveChannelForOperation translates raw 404 into ModelErrEnum.channelNotExist', async () => {
    resetChannelCache();
    axiosMock.mockRejectedValue({ response: { status: 404 } });
    await expect(
      resolveChannelForOperation({ id: 999, channelType: 'system', tmbId: 'test-tmb' })
    ).rejects.toBe(ModelErrEnum.channelNotExist);
  });

  it('member channel list tolerates 404 for uninitialized group and returns empty list', async () => {
    resetChannelCache();
    axiosMock.mockRejectedValue({ response: { status: 404 } });
    await expect(
      getMemberChannelList({ teamId: '6000000000000000000000aa', tmbId: 'new-tmb' })
    ).resolves.toEqual({
      list: [],
      total: 0
    });
  });
});

describe('channel controller — list views with relatedModelCount', () => {
  beforeEach(() => {
    setupModels();
    mockChannels();
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
    const { list, total } = await getMemberChannelList({
      teamId: '6000000000000000000000aa',
      tmbId: TMB_A
    });
    expect(total).toBe(2);
    expect(list.find((c) => c.id === 201)?.relatedModelCount).toBe(1);
    expect(list.find((c) => c.id === 202)?.relatedModelCount).toBe(1);
    expect(list.find((c) => c.id === 201)?.group_id).toBe(`fastgpt:tmb:${TMB_A}`);
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
    const member = await getMemberChannelList({
      teamId: '6000000000000000000000aa',
      tmbId: 'tmb-a'
    });
    expect(member.total).toBe(0);
    expect(member.list).toEqual([]);
  });
});
