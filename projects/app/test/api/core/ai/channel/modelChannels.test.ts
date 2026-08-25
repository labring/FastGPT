import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getUserAccessibleModels } from '@fastgpt/service/support/permission/model/controller';
import { getModelChannelsMapByModels } from '@fastgpt/service/core/ai/channel';
import { Call } from '@test/utils/request';
import modelChannelsHandler from '@/pages/api/core/ai/channel/modelChannels';

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

const TMB_ID = 'tmbId';

const mockAuth = (isRoot = false) => {
  vi.mocked(authUserPer).mockResolvedValue({
    userId: 'userId',
    teamId: 'teamId',
    tmbId: TMB_ID,
    isRoot,
    permission: new TeamPermission({ isOwner: isRoot }),
    tmb: { permission: new TeamPermission({ isOwner: isRoot }) }
  } as any);
};

// Minimal LLM model shape (SystemModelItemType fields used by the handler)
const model = (id: string, isSystem: boolean) => ({
  id,
  type: 'llm',
  provider: 'OpenAI',
  model: isSystem ? 'sys-model' : 'private-model',
  name: 'Model',
  isActive: true,
  isSystem,
  tmbId: isSystem ? undefined : TMB_ID,
  maxContext: 128000,
  maxResponse: 4096,
  quoteMaxToken: 3000,
  functionCall: true,
  toolChoice: true
});

const setModelCache = (models: ReturnType<typeof model>[]) => {
  (global as any).systemModelIdMap = new Map(models.map((m) => [m.id, m]));
};

describe('GET /api/core/ai/channel/modelChannels (channels of one model)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setModelCache([model('m1', true), model('m2', false)]);
  });

  it('returns the own-bucket channels of a visible model (root system model)', async () => {
    mockAuth(true);
    vi.mocked(getUserAccessibleModels).mockResolvedValue([model('m1', true)] as any);
    vi.mocked(getModelChannelsMapByModels).mockResolvedValue(
      new Map([
        [
          'm1',
          [
            { id: 1, name: 'system-ch', status: 1 },
            { id: 2, name: 'disabled-ch', status: 2 }
          ]
        ]
      ])
    );

    const res = await Call(modelChannelsHandler, { query: { modelId: 'm1' } });

    expect(res.code).toBe(200);
    expect(res.data.channels).toEqual([
      { id: 1, name: 'system-ch', status: 1 },
      { id: 2, name: 'disabled-ch', status: 2 }
    ]);
    expect(vi.mocked(getModelChannelsMapByModels)).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'm1' })
    ]);
  });

  it('rejects an unknown model id with modelUnExist', async () => {
    mockAuth(true);
    vi.mocked(getUserAccessibleModels).mockResolvedValue([model('m1', true)] as any);

    const res = await Call(modelChannelsHandler, { query: { modelId: 'unknown' } });

    expect(res.code).toBe(500);
    expect(res.error).toBe('modelUnExist');
    expect(vi.mocked(getModelChannelsMapByModels)).not.toHaveBeenCalled();
  });

  it('rejects a model outside the requester accessible set with unAuthModel', async () => {
    mockAuth(false);
    vi.mocked(getUserAccessibleModels).mockResolvedValue([model('m2', false)] as any);

    const res = await Call(modelChannelsHandler, { query: { modelId: 'm1' } });

    expect(res.code).toBe(500);
    expect(res.error).toBe('unAuthModel');
    expect(vi.mocked(getModelChannelsMapByModels)).not.toHaveBeenCalled();
  });

  it('falls back to an empty channel list when aiproxy fails (not on the critical path)', async () => {
    mockAuth(true);
    vi.mocked(getUserAccessibleModels).mockResolvedValue([model('m1', true)] as any);
    vi.mocked(getModelChannelsMapByModels).mockRejectedValue(new Error('aiproxy down'));

    const res = await Call(modelChannelsHandler, { query: { modelId: 'm1' } });

    expect(res.code).toBe(200);
    expect(res.data.channels).toEqual([]);
  });
});
