import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrainingAuditModelName } from '@fastgpt/service/core/dataset/training/audit';

const mocks = vi.hoisted(() => ({
  getTeamModelHandle: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: mocks.getTeamModelHandle
}));

describe('getTrainingAuditModelName', () => {
  beforeEach(() => {
    mocks.getTeamModelHandle.mockReset();
  });

  it('prefers the resolved model id so the audit keeps a stable identity', async () => {
    mocks.getTeamModelHandle.mockResolvedValue({
      findModelData: ({ modelId }: { modelId?: string }) =>
        modelId === 'team-model-id'
          ? { modelId: 'team-model-id', model: 'text-embedding' }
          : undefined
    });

    await expect(
      getTrainingAuditModelName({
        teamId: 'team-id',
        reference: { modelId: 'team-model-id', model: 'old-name' }
      })
    ).resolves.toBe('team-model-id');
  });

  it('falls back to the stored reference when the model was removed from the team', async () => {
    mocks.getTeamModelHandle.mockResolvedValue({
      findModelData: () => undefined
    });

    await expect(
      getTrainingAuditModelName({
        teamId: 'team-id',
        reference: { modelId: undefined, model: 'legacy-embedding' }
      })
    ).resolves.toBe('legacy-embedding');
  });

  it('returns an empty label for an unconfigured model instead of throwing', async () => {
    mocks.getTeamModelHandle.mockResolvedValue({ findModelData: () => undefined });

    await expect(getTrainingAuditModelName({ teamId: 'team-id', reference: {} })).resolves.toBe('');
    // 引用为空时不应触发模型目录查询。
    expect(mocks.getTeamModelHandle).not.toHaveBeenCalled();
  });

  it('keeps the stored reference when the model catalog is unavailable', async () => {
    mocks.getTeamModelHandle.mockRejectedValue(new Error('catalog unavailable'));

    await expect(
      getTrainingAuditModelName({
        teamId: 'team-id',
        reference: { modelId: 'team-model-id' }
      })
    ).resolves.toBe('team-model-id');
  });
});
