import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';
import { replaceInvalidModelReferences } from '@/service/core/ai/model/invalidReferences/service';
import { handler } from '@/pages/api/core/ai/model/invalidReferences/replace';

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({ authUserPer: vi.fn() }));
vi.mock('@fastgpt/service/support/user/team/controller', () => ({ getTmbInfoByTmbId: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({ getTeamModelHandle: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  getAuthorizedModelIds: vi.fn()
}));
vi.mock('@/service/core/ai/model/invalidReferences/service', () => ({
  replaceInvalidModelReferences: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (route: unknown) => route }));

const replacement = {
  llmModelId: 'llm-id',
  ttsModelId: 'tts-id',
  rerankModelId: 'rerank-id'
};
const count = {
  scannedRecords: 0,
  replacedRecords: 0,
  replacedReferences: 0,
  skippedReferences: 0,
  conflicts: 0,
  failedRecords: 0
};
const countsByModel = { llm: count, tts: count, rerank: count };
const result = {
  completed: true,
  counts: { dataset: countsByModel, app: countsByModel, version: countsByModel },
  failedSamples: []
};
const modelHandle = { version: 'catalog-v1', getModelData: vi.fn() };
const owner = {
  teamId: 'team-id',
  tmbId: 'member-id',
  role: TeamMemberRoleEnum.owner,
  status: TeamMemberStatusEnum.active,
  permission: {}
};
const request = () => ({ method: 'POST', body: { replacement } }) as Parameters<typeof handler>[0];

describe('replace invalid model references API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelHandle.getModelData.mockReset();
    modelHandle.getModelData.mockReturnValue({
      config: { voices: [{ label: 'Default', value: 'default-voice' }] }
    });
    vi.mocked(authUserPer).mockResolvedValue({ ...owner, tmb: owner, isRoot: false } as any);
    vi.mocked(getTmbInfoByTmbId).mockResolvedValue(owner as any);
    vi.mocked(getTeamModelHandle).mockResolvedValue(modelHandle as any);
    vi.mocked(getAuthorizedModelIds).mockResolvedValue(new Set(Object.values(replacement)));
    vi.mocked(replaceInvalidModelReferences).mockResolvedValue(result);
  });

  it('rejects a root account that is not the actual team owner', async () => {
    vi.mocked(authUserPer).mockResolvedValue({
      ...owner,
      tmb: { ...owner, role: null },
      isRoot: true
    } as any);

    await expect(handler(request())).rejects.toBeDefined();
    expect(replaceInvalidModelReferences).not.toHaveBeenCalled();
  });

  it('does not allow another HTTP method to trigger the replacement', async () => {
    await expect(handler({ ...request(), method: 'GET' })).rejects.toThrow('Method not allowed');
    expect(replaceInvalidModelReferences).not.toHaveBeenCalled();
  });

  it('validates all three target types before writing and rechecks owner before each batch', async () => {
    vi.mocked(replaceInvalidModelReferences).mockImplementation(async ({ assertCanContinue }) => {
      await assertCanContinue();
      return result;
    });

    await expect(handler(request())).resolves.toEqual(result);
    expect(modelHandle.getModelData).toHaveBeenCalledWith(
      { modelId: replacement.llmModelId },
      { type: ModelTypeEnum.llm, authorizedIds: expect.any(Set) }
    );
    expect(modelHandle.getModelData).toHaveBeenCalledWith(
      { modelId: replacement.ttsModelId },
      { type: ModelTypeEnum.tts, authorizedIds: expect.any(Set) }
    );
    expect(modelHandle.getModelData).toHaveBeenCalledWith(
      { modelId: replacement.rerankModelId },
      { type: ModelTypeEnum.rerank, authorizedIds: expect.any(Set) }
    );
    expect(getTmbInfoByTmbId).toHaveBeenCalledTimes(2);
  });

  it('blocks further writes when owner role is revoked', async () => {
    vi.mocked(replaceInvalidModelReferences).mockImplementation(async ({ assertCanContinue }) => {
      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({ ...owner, role: null } as any);
      await assertCanContinue();
      return result;
    });

    await expect(handler(request())).rejects.toBeDefined();
  });

  it('rejects an unavailable target before scanning', async () => {
    modelHandle.getModelData.mockImplementation((reference: { modelId: string }) => {
      if (reference.modelId === replacement.rerankModelId) throw new Error('Unavailable model');
      return { config: { voices: [{ label: 'Default', value: 'default-voice' }] } };
    });

    await expect(handler(request())).rejects.toThrow('Unavailable model');
    expect(replaceInvalidModelReferences).not.toHaveBeenCalled();
  });

  it('rejects a TTS target with no available voice before scanning', async () => {
    modelHandle.getModelData.mockImplementation((reference: { modelId: string }) => ({
      config: {
        voices:
          reference.modelId === replacement.ttsModelId ? [] : [{ label: 'Default', value: 'voice' }]
      }
    }));

    await expect(handler(request())).rejects.toThrow('available voice');
    expect(replaceInvalidModelReferences).not.toHaveBeenCalled();
  });
});
