import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getUserAccessibleModels } from '@fastgpt/service/support/permission/model/controller';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { Call } from '@test/utils/request';
import usageLogsHandler from '@/pages/api/core/ai/model/usageLogs';

// Mock auth + permission + mongo layers so no real DB call happens.
vi.mock('@fastgpt/service/support/permission/user/auth', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/user/auth')>();
  return { ...actual, authUserPer: vi.fn() };
});

vi.mock('@fastgpt/service/support/permission/model/controller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/model/controller')>();
  return { ...actual, getUserAccessibleModels: vi.fn() };
});

vi.mock('@fastgpt/service/support/user/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/support/user/utils')>();
  return { ...actual, addSourceMember: vi.fn() };
});

vi.mock('@fastgpt/service/support/wallet/usage/usageItemSchema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/wallet/usage/usageItemSchema')>();
  return {
    ...actual,
    MongoUsageItem: { find: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn() }
  };
});

vi.mock('@fastgpt/service/support/wallet/usage/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/wallet/usage/schema')>();
  return { ...actual, MongoUsage: { find: vi.fn() } };
});

vi.mock('@fastgpt/service/support/user/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/support/user/schema')>();
  return { ...actual, MongoUser: { find: vi.fn() } };
});

vi.mock('@fastgpt/service/support/user/team/teamMemberSchema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/user/team/teamMemberSchema')>();
  return { ...actual, MongoTeamMember: { find: vi.fn() } };
});

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

const model = (overrides: Record<string, any>) => ({
  id: 'm1',
  type: 'llm',
  provider: 'OpenAI',
  model: 'gpt-4o',
  name: 'GPT-4o',
  isActive: true,
  isSystem: true,
  ...overrides
});

// Chainable query builder stub (find(...).sort().skip().limit().lean())
const chain = (value: any) => ({
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value)
});

const usageItem = (overrides: Record<string, any>) => ({
  _id: 'item-1',
  teamId: 'teamId',
  usageId: 'usage-1',
  name: 'AI Chat',
  amount: 10,
  time: new Date('2026-08-01T10:00:00Z'),
  modelId: 'm1',
  model: 'gpt-4o',
  inputTokens: 100,
  outputTokens: 50,
  ...overrides
});

describe('POST /api/core/ai/model/usageLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      model({ id: 'm1', model: 'gpt-4o', name: 'GPT-4o' }),
      model({ id: 'm2', type: 'embedding', model: 'text-embedding-3', name: 'Embedding 3' })
    ] as any);
    vi.mocked(addSourceMember).mockResolvedValue([]);
    vi.mocked(MongoUsageItem.countDocuments).mockResolvedValue(1);
    // handler calls MongoUsage.find(...).lean() — return a chainable stub
    vi.mocked(MongoUsage.find).mockImplementation(() => chain([]));
  });

  it('only queries records of accessible models (AUTH-TC08): modelId $in + legacy name fallback', async () => {
    vi.mocked(MongoUsageItem.find).mockImplementation(() => chain([usageItem({})])) as any;

    const res = await Call(usageLogsHandler, {
      body: { dateStart: '2026-07-01', dateEnd: '2026-09-01' }
    });

    expect(res.code).toBe(200);
    const where = vi.mocked(MongoUsageItem.find).mock.calls[0][0];
    expect(where.$or).toEqual([
      { modelId: { $in: ['m1', 'm2'] } },
      { modelId: { $exists: false }, model: { $in: ['gpt-4o', 'text-embedding-3'] } }
    ]);
    // Records with an inaccessible modelId never enter the query
    expect(where.$or[0].modelId.$in).not.toContain('m3');
  });

  it('narrows to a selected model by id + legacy name; non-visible modelId returns empty', async () => {
    vi
      .mocked(MongoUsageItem.find)
      .mockImplementation(() => chain([usageItem({ modelId: 'm2' })])) as any;

    const res = await Call(usageLogsHandler, {
      body: { modelId: 'm2', dateStart: '2026-07-01', dateEnd: '2026-09-01' }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(MongoUsageItem.find).mock.calls[0][0].$or).toEqual([
      { modelId: 'm2' },
      { modelId: { $exists: false }, model: 'text-embedding-3' }
    ]);
    expect(res.data.list[0].name).toBe('Embedding 3');
    expect(res.data.list[0].type).toBe('embedding');

    // modelId not in the accessible set leaks nothing
    vi.mocked(MongoUsageItem.find).mockClear();
    const resHidden = await Call(usageLogsHandler, {
      body: { modelId: 'secret-model' }
    });
    expect(resHidden.data.list).toEqual([]);
    expect(resHidden.data.total).toBe(0);
    expect(vi.mocked(MongoUsageItem.find)).not.toHaveBeenCalled();
  });

  it('filters accessible models by type before building the query', async () => {
    vi.mocked(MongoUsageItem.find).mockImplementation(() => chain([])) as any;

    await Call(usageLogsHandler, { body: { type: 'embedding' } });

    const where = vi.mocked(MongoUsageItem.find).mock.calls[0][0];
    expect(where.$or).toEqual([
      { modelId: { $in: ['m2'] } },
      { modelId: { $exists: false }, model: { $in: ['text-embedding-3'] } }
    ]);
  });

  it('resolves creator info via usage->tmb join (F3-S5-TC04)', async () => {
    vi
      .mocked(MongoUsageItem.find)
      .mockImplementation(() =>
        chain([
          usageItem({ _id: 'item-1', usageId: 'usage-1' }),
          usageItem({ _id: 'item-2', usageId: 'usage-2' })
        ])
      ) as any;
    vi.mocked(MongoUsageItem.countDocuments).mockResolvedValue(2);
    // usage -> tmbId (handler chains .lean())
    vi.mocked(MongoUsage.find).mockImplementation(() =>
      chain([
        { _id: 'usage-1', tmbId: 'tmbA' },
        { _id: 'usage-2', tmbId: 'tmbB' }
      ])
    );
    vi.mocked(addSourceMember).mockResolvedValue([
      {
        _id: 'usage-1',
        tmbId: 'tmbA',
        sourceMember: { name: 'alice', avatar: null, status: 'active' }
      },
      {
        _id: 'usage-2',
        tmbId: 'tmbB',
        sourceMember: { name: 'bob', avatar: null, status: 'active' }
      }
    ] as any);

    const res = await Call(usageLogsHandler, { body: {} });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item: any) => item.sourceMember?.name)).toEqual(['alice', 'bob']);
    // one batch tmb lookup for the page
    const callArg = vi.mocked(addSourceMember).mock.calls[0][0];
    expect(callArg.list.map((u: any) => String(u.tmbId))).toEqual(['tmbA', 'tmbB']);
  });

  it('filters by creator keyword: username -> tmbId -> usageId -> usageId $in', async () => {
    // handler chains .lean() on user/teamMember lookups too
    vi.mocked(MongoUser.find).mockImplementation(() => chain([{ _id: 'userId-alice' }]));
    vi.mocked(MongoTeamMember.find).mockImplementation(() => chain([{ _id: 'tmbA' }]));
    vi.mocked(MongoUsage.find).mockImplementationOnce(() => chain([{ _id: 'usage-1' }]));
    vi.mocked(MongoUsageItem.find).mockImplementation(() => chain([])) as any;

    await Call(usageLogsHandler, { body: { search: 'ali' } });

    // username regex lookup
    expect(vi.mocked(MongoUser.find).mock.calls[0][0]).toEqual({
      username: /ali/i
    });
    const where = vi.mocked(MongoUsageItem.find).mock.calls[0][0];
    expect(where.usageId).toEqual({ $in: [expect.anything()] });
    expect(String((where.usageId as any).$in[0])).toBe('usage-1');
  });

  it('returns empty when the creator keyword matches nobody', async () => {
    vi.mocked(MongoUser.find).mockImplementation(() => chain([]));

    const res = await Call(usageLogsHandler, { body: { search: 'nobody' } });

    expect(res.data.list).toEqual([]);
    expect(res.data.total).toBe(0);
    expect(vi.mocked(MongoUsageItem.find)).not.toHaveBeenCalled();
  });

  it('resolves an accessible legacy record by its stored upstream model name', async () => {
    vi
      .mocked(MongoUsageItem.find)
      .mockImplementation(() => chain([usageItem({ modelId: undefined, model: 'gpt-4o' })])) as any;

    const res = await Call(usageLogsHandler, { body: {} });

    expect(res.data.list[0].name).toBe('GPT-4o');
    expect(res.data.list[0].type).toBe('llm');
    expect(res.data.list[0].totalPoints).toBe(10);
  });

  it('applies pagination (skip/limit) and returns total', async () => {
    vi.mocked(MongoUsageItem.find).mockImplementation(() => chain([usageItem({})])) as any;
    vi.mocked(MongoUsageItem.countDocuments).mockResolvedValue(42);

    const res = await Call(usageLogsHandler, { body: { pageNum: 3, pageSize: 10 } });

    expect(res.data.total).toBe(42);
    const chainObj = vi.mocked(MongoUsageItem.find).mock.results[0].value as any;
    expect(chainObj.skip).toHaveBeenCalledWith(20);
    expect(chainObj.limit).toHaveBeenCalledWith(10);
  });
});
