import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrainingAuditModelLabel } from '@fastgpt/service/core/dataset/training/audit';

const mocks = vi.hoisted(() => ({
  getTeamModelHandle: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: mocks.getTeamModelHandle
}));

describe('getTrainingAuditModelLabel', () => {
  beforeEach(() => {
    mocks.getTeamModelHandle.mockReset();
  });

  it('returns the readable name and the stable id of the resolved model', async () => {
    mocks.getTeamModelHandle.mockResolvedValue({
      findModelData: ({ modelId }: { modelId?: string }) =>
        modelId === 'team-model-id'
          ? { modelId: 'team-model-id', model: 'text-embedding', name: '团队嵌入模型' }
          : undefined
    });

    await expect(
      getTrainingAuditModelLabel({
        teamId: 'team-id',
        reference: { modelId: 'team-model-id', model: 'old-name' }
      })
    ).resolves.toEqual({ modelId: 'team-model-id', modelName: '团队嵌入模型' });
  });

  it('falls back to the provider model when the catalog entry has no name', async () => {
    mocks.getTeamModelHandle.mockResolvedValue({
      findModelData: () => ({ modelId: 'team-model-id', model: 'text-embedding', name: '' })
    });

    await expect(
      getTrainingAuditModelLabel({ teamId: 'team-id', reference: { modelId: 'team-model-id' } })
    ).resolves.toEqual({ modelId: 'team-model-id', modelName: 'text-embedding' });
  });

  it('falls back to the stored reference when the model was removed from the team', async () => {
    mocks.getTeamModelHandle.mockResolvedValue({ findModelData: () => undefined });

    // 历史引用没有 ID 时，名称沿用旧的 model 标识。
    await expect(
      getTrainingAuditModelLabel({
        teamId: 'team-id',
        reference: { modelId: undefined, model: 'legacy-embedding' }
      })
    ).resolves.toEqual({ modelId: 'legacy-embedding', modelName: 'legacy-embedding' });

    // 只有 ID 时，名称只能退回 ID，避免日志为空。
    await expect(
      getTrainingAuditModelLabel({ teamId: 'team-id', reference: { modelId: 'missing-model-id' } })
    ).resolves.toEqual({ modelId: 'missing-model-id', modelName: 'missing-model-id' });
  });

  it('returns empty labels for an unconfigured model instead of throwing', async () => {
    await expect(getTrainingAuditModelLabel({ teamId: 'team-id', reference: {} })).resolves.toEqual(
      { modelId: '', modelName: '' }
    );
    // 引用为空时不应触发模型目录查询。
    expect(mocks.getTeamModelHandle).not.toHaveBeenCalled();
  });

  it('keeps the stored reference when the model catalog is unavailable', async () => {
    mocks.getTeamModelHandle.mockRejectedValue(new Error('catalog unavailable'));

    await expect(
      getTrainingAuditModelLabel({
        teamId: 'team-id',
        reference: { modelId: 'team-model-id', model: 'text-embedding' }
      })
    ).resolves.toEqual({ modelId: 'team-model-id', modelName: 'text-embedding' });
  });
});
