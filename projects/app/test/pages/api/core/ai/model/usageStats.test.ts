import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getUserAccessibleModels } from '@fastgpt/service/support/permission/model/controller';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import { Call } from '@test/utils/request';
import usageStatsHandler from '@/pages/api/core/ai/model/usageStats';

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

vi.mock('@fastgpt/service/support/wallet/usage/usageItemSchema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/wallet/usage/usageItemSchema')>();
  return {
    ...actual,
    MongoUsageItem: { find: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn() }
  };
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

const facetResult = (overrides: Record<string, any>) => ({
  totals: [{ calls: 30, tokens: 1200, points: 300 }],
  trend: [
    { date: '2026-08-01', calls: 10, tokens: 400, points: 100 },
    { date: '2026-08-02', calls: 20, tokens: 800, points: 200 }
  ],
  distribution: [
    { _id: 'm1', calls: 20, points: 200 },
    { _id: 'm2', calls: 10, points: 100 }
  ],
  ...overrides
});

describe('POST /api/core/ai/model/usageStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(getUserAccessibleModels).mockResolvedValue([
      model({ id: 'm1', model: 'gpt-4o', name: 'GPT-4o' }),
      model({ id: 'm2', type: 'embedding', model: 'text-embedding-3', name: 'Embedding 3' })
    ] as any);
    vi.mocked(MongoUsageItem.aggregate).mockResolvedValue([facetResult({})] as any);
  });

  it('restricts the aggregation to accessible models (AUTH-TC08)', async () => {
    const res = await Call(usageStatsHandler, {
      body: { dateStart: '2026-07-01', dateEnd: '2026-09-01' }
    });

    expect(res.code).toBe(200);
    const [pipeline] = vi.mocked(MongoUsageItem.aggregate).mock.calls[0];
    const match = (pipeline as any[])[0].$match;
    expect(match.$or).toEqual([
      { modelId: { $in: ['m1', 'm2'] } },
      { modelId: { $exists: false }, model: { $in: ['gpt-4o', 'text-embedding-3'] } }
    ]);
    expect(match.time.$gte).toBeInstanceOf(Date);
    expect(match.time.$lte).toBeInstanceOf(Date);
  });

  it('returns formatted totals, trend and per-model distribution with resolved names', async () => {
    const res = await Call(usageStatsHandler, { body: {} });

    expect(res.code).toBe(200);
    expect(res.data.totalCalls).toBe(30);
    expect(res.data.totalTokens).toBe(1200);
    expect(res.data.totalPoints).toBe(300);
    expect(res.data.trend).toEqual([
      { date: '2026-08-01', calls: 10, tokens: 400, points: 100 },
      { date: '2026-08-02', calls: 20, tokens: 800, points: 200 }
    ]);
    // names resolved from the accessible model set (by id)
    expect(res.data.modelDistribution).toEqual([
      { modelId: 'm1', name: 'GPT-4o', calls: 20, points: 200 },
      { modelId: 'm2', name: 'Embedding 3', calls: 10, points: 100 }
    ]);
  });

  it('resolves an accessible legacy distribution key by upstream model name', async () => {
    vi.mocked(MongoUsageItem.aggregate).mockResolvedValue([
      facetResult({ distribution: [{ _id: 'gpt-4o', calls: 5, points: 50 }] })
    ] as any);

    const res = await Call(usageStatsHandler, { body: {} });

    expect(res.data.modelDistribution[0]).toEqual({
      modelId: 'gpt-4o',
      name: 'GPT-4o',
      calls: 5,
      points: 50
    });
  });

  it('narrows to a selected model; non-visible modelId returns zeros without aggregating', async () => {
    vi.mocked(MongoUsageItem.aggregate).mockClear();

    const res = await Call(usageStatsHandler, { body: { modelId: 'secret-model' } });

    expect(res.data).toEqual({
      totalCalls: 0,
      totalTokens: 0,
      totalPoints: 0,
      trend: [],
      modelDistribution: []
    });
    expect(vi.mocked(MongoUsageItem.aggregate)).not.toHaveBeenCalled();
  });

  it('filters accessible models by type before aggregating', async () => {
    await Call(usageStatsHandler, { body: { type: 'embedding' } });

    const [pipeline] = vi.mocked(MongoUsageItem.aggregate).mock.calls[0];
    const match = (pipeline as any[])[0].$match;
    expect(match.$or).toEqual([
      { modelId: { $in: ['m2'] } },
      { modelId: { $exists: false }, model: { $in: ['text-embedding-3'] } }
    ]);
  });

  it('handles an empty aggregate result with safe defaults', async () => {
    vi.mocked(MongoUsageItem.aggregate).mockResolvedValue([{}] as any);

    const res = await Call(usageStatsHandler, { body: {} });

    expect(res.data.totalCalls).toBe(0);
    expect(res.data.totalTokens).toBe(0);
    expect(res.data.totalPoints).toBe(0);
    expect(res.data.trend).toEqual([]);
    expect(res.data.modelDistribution).toEqual([]);
  });
});
