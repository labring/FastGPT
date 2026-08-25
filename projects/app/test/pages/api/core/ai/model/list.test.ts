import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getUserAccessibleModels } from '@fastgpt/service/support/permission/model/controller';
import { getModelChannelsMapByModels } from '@fastgpt/service/core/ai/channel';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { OwnerRoleVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { Call } from '@test/utils/request';
import listHandler from '@/pages/api/core/ai/model/list';

// Mock auth + permission + aiproxy layers so no real DB / aiproxy call happens.
vi.mock('@fastgpt/service/support/permission/user/auth', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/user/auth')>();
  return {
    ...actual,
    authUserPer: vi.fn()
  };
});

vi.mock('@fastgpt/service/support/permission/model/controller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/model/controller')>();
  return {
    ...actual,
    getUserAccessibleModels: vi.fn()
  };
});

vi.mock('@fastgpt/service/core/ai/channel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/channel')>();
  return {
    ...actual,
    getModelChannelsMapByModels: vi.fn()
  };
});

vi.mock('@fastgpt/service/support/user/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/support/user/utils')>();
  return {
    ...actual,
    addSourceMember: vi.fn()
  };
});

// Mock the permission batch layers used by the list handler's permission snapshot
vi.mock('@fastgpt/service/support/permission/schema', () => ({
  MongoResourcePermission: { find: vi.fn() }
}));
vi.mock('@fastgpt/service/support/permission/memberGroup/controllers', () => ({
  getGroupsByTmbId: vi.fn()
}));
vi.mock('@fastgpt/service/support/permission/org/controllers', () => ({
  getOrgIdSetWithParentByTmbId: vi.fn()
}));

const TMB_ID = 'tmbId';

const mockAuth = () => {
  vi.mocked(authUserPer).mockResolvedValue({
    userId: 'userId',
    teamId: 'teamId',
    tmbId: TMB_ID,
    isRoot: true,
    permission: new TeamPermission({ isOwner: true }),
    tmb: { permission: new TeamPermission({ isOwner: true }) }
  } as any);
};

// Minimal LLM model shape (SystemModelItemType fields used by the handler)
const model = (overrides: Record<string, any>) => ({
  id: 'm-id',
  type: 'llm',
  provider: 'OpenAI',
  model: 'gpt-4o',
  name: 'GPT-4o',
  isActive: true,
  isSystem: false,
  tmbId: TMB_ID,
  maxContext: 128000,
  maxResponse: 4096,
  quoteMaxToken: 3000,
  functionCall: true,
  toolChoice: true,
  ...overrides
});

const mockEmptyChannelMap = () => {
  vi.mocked(getModelChannelsMapByModels).mockResolvedValue(new Map());
};

describe('POST /api/core/ai/model/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockEmptyChannelMap();
    vi.mocked(addSourceMember).mockResolvedValue([]);
  });

  it('filters by isSystem=true (system-model tab)', async () => {
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      model({ id: 'sys1', isSystem: true, tmbId: undefined, model: 'sys-model' }),
      model({ id: 'prv1', isSystem: false, model: 'private-model' })
    ] as any);

    const res = await Call(listHandler, { body: { isSystem: true } });

    expect(res.code).toBe(200);
    expect(res.data.list.map((m: any) => m.id)).toEqual(['sys1']);
    expect(res.data.total).toBe(1);
    // System models carry no sourceMember
    expect(res.data.list[0].sourceMember).toBeUndefined();
    expect(vi.mocked(addSourceMember)).not.toHaveBeenCalled();
  });

  it('filters by isSystem=false and resolves creators of private models (team tab)', async () => {
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      model({ id: 'sys1', isSystem: true, tmbId: undefined, model: 'sys-model' }),
      model({ id: 'prv1', isSystem: false, tmbId: 'tmbA', model: 'private-a' })
    ] as any);
    vi.mocked(addSourceMember).mockResolvedValue([
      {
        ...model({ id: 'prv1', isSystem: false, tmbId: 'tmbA', model: 'private-a' }),
        sourceMember: { name: 'alice', avatar: null, status: 'active' }
      }
    ] as any);

    const res = await Call(listHandler, { body: { isSystem: false } });

    expect(res.code).toBe(200);
    expect(res.data.list.map((m: any) => m.id)).toEqual(['prv1']);
    expect(res.data.list[0].sourceMember.name).toBe('alice');
    // Only private models are batched into the lookup (system models excluded)
    const callArg = vi.mocked(addSourceMember).mock.calls[0][0];
    expect(callArg.list.map((m: any) => m.tmbId)).toEqual(['tmbA']);
  });

  it('resolves creators only for the current page (pagination)', async () => {
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      model({ id: 'p1', isSystem: false, tmbId: 'tmb1', model: 'm1' }),
      model({ id: 'p2', isSystem: false, tmbId: 'tmb2', model: 'm2' }),
      model({ id: 'p3', isSystem: false, tmbId: 'tmb3', model: 'm3' }),
      model({ id: 'p4', isSystem: false, tmbId: 'tmb4', model: 'm4' })
    ] as any);
    vi.mocked(addSourceMember).mockResolvedValue([
      {
        ...model({ id: 'p3', isSystem: false, tmbId: 'tmb3', model: 'm3' }),
        sourceMember: { name: 'charlie', avatar: null, status: 'active' }
      },
      {
        ...model({ id: 'p4', isSystem: false, tmbId: 'tmb4', model: 'm4' }),
        sourceMember: { name: 'dave', avatar: null, status: 'active' }
      }
    ] as any);

    const res = await Call(listHandler, { body: { pageNum: 2, pageSize: 2 } });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(4);
    expect(res.data.list.map((m: any) => m.id)).toEqual(['p3', 'p4']);
    // Only the two tmbIds on the page are queried (one batch lookup)
    const callArg = vi.mocked(addSourceMember).mock.calls[0][0];
    expect(callArg.list.map((m: any) => m.tmbId)).toEqual(['tmb3', 'tmb4']);
    expect(res.data.list.map((m: any) => m.sourceMember?.name)).toEqual(['charlie', 'dave']);
  });

  it('returns channelCount from the model-bucket channel map', async () => {
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      model({ id: 'sys1', isSystem: true, tmbId: undefined, model: 'sys-model' })
    ] as any);
    vi.mocked(getModelChannelsMapByModels).mockResolvedValue(
      new Map([
        [
          'sys1',
          [
            { id: 1, name: 'ch1', status: 1 },
            { id: 2, name: 'ch2', status: 2 }
          ]
        ]
      ])
    );

    const res = await Call(listHandler, { body: {} });

    expect(res.code).toBe(200);
    expect(res.data.list[0].channelCount).toBe(2);
  });

  it('passes through provider/type/search/isActive filters to the visible model set', async () => {
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      model({
        id: 'llm1',
        type: 'llm',
        provider: 'OpenAI',
        model: 'gpt-4o',
        name: 'GPT-4o',
        isActive: true
      }),
      model({
        id: 'llm2',
        type: 'llm',
        provider: 'DeepSeek',
        model: 'deepseek-chat',
        name: 'DeepSeek Chat',
        isActive: true
      }),
      model({
        id: 'emb1',
        type: 'embedding',
        provider: 'OpenAI',
        model: 'text-embedding',
        name: 'Embedding',
        isActive: false
      })
    ] as any);

    const res = await Call(listHandler, {
      body: { provider: 'OpenAI', type: 'llm', search: 'gpt', isActive: 'active' }
    });

    expect(res.code).toBe(200);
    expect(res.data.list.map((m: any) => m.id)).toEqual(['llm1']);
  });

  it('returns all added providers before filtering and hides team model prices', async () => {
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      model({
        id: 'team-openai',
        provider: 'OpenAI',
        charsPointsPrice: 3,
        priceTiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }]
      }),
      model({
        id: 'system-anthropic',
        provider: 'Anthropic',
        isSystem: true,
        tmbId: undefined
      })
    ] as any);

    const res = await Call(listHandler, {
      body: { provider: 'OpenAI', pageNum: 1, pageSize: 20 }
    });

    expect(res.code).toBe(200);
    expect(res.data.providers).toEqual(['OpenAI', 'Anthropic']);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].charsPointsPrice).toBeUndefined();
    expect(res.data.list[0].priceTiers).toBeUndefined();
  });

  it('returns full permission (isOwner) for root on every model', async () => {
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      model({ id: 'sys1', isSystem: true, tmbId: undefined, model: 'sys-model' }),
      model({ id: 'prv1', isSystem: false, model: 'private-model' })
    ] as any);

    const res = await Call(listHandler, { body: {} });

    expect(res.code).toBe(200);
    for (const item of res.data.list as any[]) {
      expect(item.permission.isOwner).toBe(true);
      expect(item.permission.hasManagePer).toBe(true);
      expect(item.permission.hasWritePer).toBe(true);
      expect(item.permission.hasReadPer).toBe(true);
      // Root path must not query the permission collection
      expect(MongoResourcePermission.find).not.toHaveBeenCalled();
    }
  });

  it('builds per-model permission snapshot for non-root users', async () => {
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      // system model -> read-only for non-root
      model({ id: 'sys1', isSystem: true, tmbId: undefined, model: 'sys-model' }),
      // own model -> owner
      model({ id: 'own1', isSystem: false, tmbId: TMB_ID, model: 'own-model' }),
      // authorized model (read-only collaborator)
      model({ id: 'clb1', isSystem: false, tmbId: 'otherTmb', model: 'clb-model' })
    ] as any);
    vi.mocked(authUserPer).mockResolvedValue({
      userId: 'userId',
      teamId: 'teamId',
      tmbId: TMB_ID,
      isRoot: false,
      permission: new TeamPermission({}),
      tmb: { permission: new TeamPermission({}) }
    } as any);
    vi.mocked(getGroupsByTmbId).mockResolvedValue([] as any);
    vi.mocked(getOrgIdSetWithParentByTmbId).mockResolvedValue(new Set());
    vi.mocked(MongoResourcePermission.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { tmbId: 'otherTmb', resourceId: 'clb1', permission: OwnerRoleVal }, // owner row of the collaborator model
        { tmbId: TMB_ID, resourceId: 'clb1', permission: ReadRoleVal } // my read-only row
      ])
    } as any);

    const res = await Call(listHandler, { body: {} });

    expect(res.code).toBe(200);
    const list = res.data.list as any[];
    const byId = new Map(list.map((m) => [m.id, m]));

    // System model: read-only, not owner
    expect(byId.get('sys1').permission.isOwner).toBe(false);
    expect(byId.get('sys1').permission.hasReadPer).toBe(true);
    expect(byId.get('sys1').permission.hasWritePer).toBe(false);
    expect(byId.get('sys1').permission.hasManagePer).toBe(false);

    // Own model: full permissions
    expect(byId.get('own1').permission.isOwner).toBe(true);
    expect(byId.get('own1').permission.hasManagePer).toBe(true);

    // Authorized model: read-only
    expect(byId.get('clb1').permission.isOwner).toBe(false);
    expect(byId.get('clb1').permission.hasReadPer).toBe(true);
    expect(byId.get('clb1').permission.hasWritePer).toBe(false);
    expect(byId.get('clb1').permission.hasManagePer).toBe(false);

    // One batched query for the whole page (never per model)
    expect(MongoResourcePermission.find).toHaveBeenCalledTimes(1);
    const query = vi.mocked(MongoResourcePermission.find).mock.calls[0][0];
    // 排序 own first（§7.1/F3-S5）：自有模型在前，故 $in 查询 id 顺序为 own1 先行
    expect(query.resourceId).toEqual({ $in: ['own1', 'sys1', 'clb1'] });
  });
});
