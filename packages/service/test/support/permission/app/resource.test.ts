import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { AppResource } from '@fastgpt/global/core/app/type';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTeamModelHandle: vi.fn(),
  authAppByTmbId: vi.fn(),
  authDatasetByTmbId: vi.fn(),
  authSkillByTmbId: vi.fn(),
  getTmbInfoByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: mocks.getTeamModelHandle
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: mocks.authAppByTmbId
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetByTmbId: mocks.authDatasetByTmbId
}));

vi.mock('@fastgpt/service/support/permission/skill/auth', () => ({
  authSkillByTmbId: mocks.authSkillByTmbId
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: mocks.getTmbInfoByTmbId
}));

import {
  checkAppResourceReadPermissions,
  filterAuthorizedAppResources
} from '@fastgpt/service/support/permission/app/resource';

beforeEach(() => {
  vi.clearAllMocks();
  const teamId = '65f000000000000000000002';
  mocks.getTmbInfoByTmbId.mockReset().mockResolvedValue({ teamId, permission: { isOwner: false } });
  mocks.authAppByTmbId.mockReset().mockResolvedValue({ app: { teamId } });
  mocks.authDatasetByTmbId.mockReset().mockResolvedValue({ dataset: { teamId } });
  mocks.authSkillByTmbId.mockReset().mockResolvedValue({
    skill: { teamId, source: AgentSkillSourceEnum.personal }
  });
});

describe('checkAppResourceReadPermissions', () => {
  const validTmbId = '65f000000000000000000001';

  it('rejects non-ObjectId dataset resource with DatasetErrEnum.unExist in formal permission check', async () => {
    await expect(
      checkAppResourceReadPermissions({
        resources: [{ type: 'dataset', id: 'dbconn' }],
        tmbId: validTmbId
      })
    ).rejects.toBe(DatasetErrEnum.unExist);
    expect(mocks.authDatasetByTmbId).not.toHaveBeenCalled();
  });

  it('rejects non-ObjectId agent/tool resource with AppErrEnum.unExist in formal permission check', async () => {
    await expect(
      checkAppResourceReadPermissions({
        resources: [{ type: 'agent', id: 'chat input' }],
        tmbId: validTmbId
      })
    ).rejects.toBe(AppErrEnum.unExist);
    expect(mocks.authAppByTmbId).not.toHaveBeenCalled();
  });
});

describe('filterAuthorizedAppResources', () => {
  const validTmbId = '65f000000000000000000001';

  it('returns empty array when resources array is empty without checking permissions', async () => {
    const result = await filterAuthorizedAppResources({
      resources: [],
      tmbId: validTmbId
    });
    expect(result).toEqual([]);
    expect(mocks.authAppByTmbId).not.toHaveBeenCalled();
    expect(mocks.authDatasetByTmbId).not.toHaveBeenCalled();
    expect(mocks.authSkillByTmbId).not.toHaveBeenCalled();
  });

  it('returns empty array when tmbId is invalid or missing', async () => {
    const resources = [{ type: 'agent' as const, id: 'app-1' }];

    expect(await filterAuthorizedAppResources({ resources, tmbId: '' })).toEqual([]);
    expect(await filterAuthorizedAppResources({ resources, tmbId: 'invalid-id' })).toEqual([]);
    expect(await filterAuthorizedAppResources({ resources, tmbId: undefined })).toEqual([]);
    expect(mocks.authAppByTmbId).not.toHaveBeenCalled();
  });

  it('returns all resources when member has read permissions for all items', async () => {
    const resources = [
      { type: 'agent' as const, id: '65f000000000000000000010' },
      { type: 'dataset' as const, id: '65f000000000000000000020' }
    ];

    const result = await filterAuthorizedAppResources({
      resources,
      tmbId: validTmbId
    });

    expect(result).toEqual(resources);
    expect(mocks.authAppByTmbId).toHaveBeenCalledWith(
      expect.objectContaining({ appId: '65f000000000000000000010', tmbId: validTmbId })
    );
    expect(mocks.authDatasetByTmbId).toHaveBeenCalledWith(
      expect.objectContaining({ datasetId: '65f000000000000000000020', tmbId: validTmbId })
    );
  });

  it('silently filters out unauthorized resources while retaining authorized ones', async () => {
    mocks.authDatasetByTmbId.mockRejectedValue(new Error('Permission denied'));

    const resources = [
      { type: 'agent' as const, id: '65f000000000000000000010' },
      { type: 'dataset' as const, id: '65f000000000000000000020' }
    ];

    const result = await filterAuthorizedAppResources({
      resources,
      tmbId: validTmbId
    });

    expect(result).toEqual([{ type: 'agent', id: '65f000000000000000000010' }]);
  });

  it('silently filters out non-ObjectId resources in migration filter while retaining valid authorized ones', async () => {
    const resources = [
      { type: 'dataset' as const, id: 'dbconn' },
      { type: 'dataset' as const, id: '65f000000000000000000020' },
      { type: 'agent' as const, id: 'chat input' }
    ];

    const result = await filterAuthorizedAppResources({ resources, tmbId: validTmbId });
    expect(result).toEqual([{ type: 'dataset', id: '65f000000000000000000020' }]);
    expect(mocks.authDatasetByTmbId).toHaveBeenCalledOnce();
  });

  it('drops all resources to empty array when member cannot be found or is inactive', async () => {
    mocks.authAppByTmbId.mockRejectedValue('member not exist');
    mocks.getTmbInfoByTmbId.mockRejectedValue('member not exist');

    const resources = [
      { type: 'agent' as const, id: '65f000000000000000000010' },
      { type: 'skill' as const, id: '65f000000000000000000030' }
    ];

    const result = await filterAuthorizedAppResources({
      resources,
      tmbId: validTmbId
    });

    expect(result).toEqual([]);
  });

  it('throws when getTmbInfoByTmbId encounters an unexpected or database error', async () => {
    mocks.getTmbInfoByTmbId.mockRejectedValue(new Error('MongoNetworkError: connection timed out'));

    const resources = [{ type: 'agent' as const, id: '65f000000000000000000010' }];

    await expect(
      filterAuthorizedAppResources({
        resources,
        tmbId: validTmbId
      })
    ).rejects.toThrow('MongoNetworkError: connection timed out');
  });

  it('throws when resource auth encounters an unexpected or database error', async () => {
    mocks.getTmbInfoByTmbId.mockResolvedValue(undefined);
    mocks.authAppByTmbId.mockRejectedValue(new Error('MongoTimeoutError: query exceeded limit'));

    const resources = [{ type: 'agent' as const, id: '65f000000000000000000010' }];

    await expect(
      filterAuthorizedAppResources({
        resources,
        tmbId: validTmbId
      })
    ).rejects.toThrow('MongoTimeoutError: query exceeded limit');
  });
});

describe('root App resource scope', () => {
  const tmbId = '65f000000000000000000001';
  const teamId = '65f000000000000000000002';
  const resourceId = '65f000000000000000000020';

  it('preserves root access to same-team apps, tools, datasets and skills without cross-team access', async () => {
    const resourceTypes: AppResource['type'][] = ['agent', 'tool', 'dataset', 'skill'];
    const resources = resourceTypes.map((type) => ({
      type,
      id: resourceId
    }));
    await expect(
      checkAppResourceReadPermissions({ resources, tmbId, isRoot: true })
    ).resolves.toBeUndefined();
    for (const auth of [mocks.authAppByTmbId, mocks.authDatasetByTmbId, mocks.authSkillByTmbId]) {
      expect(auth).toHaveBeenCalledWith(expect.objectContaining({ tmbId, isRoot: true }));
    }
    expect(mocks.getTmbInfoByTmbId).toHaveBeenCalledOnce();
  });

  it.each([
    { type: 'agent' as const, error: AppErrEnum.unAuthApp },
    { type: 'tool' as const, error: AppErrEnum.unAuthApp },
    { type: 'dataset' as const, error: DatasetErrEnum.unAuthDataset },
    { type: 'skill' as const, error: SkillErrEnum.unAuthSkill }
  ])('rejects cross-team $type resources even for root', async ({ type, error }) => {
    mocks.authAppByTmbId.mockResolvedValue({ app: { teamId: 'other-team' } });
    mocks.authDatasetByTmbId.mockResolvedValue({ dataset: { teamId: 'other-team' } });
    mocks.authSkillByTmbId.mockResolvedValue({
      skill: { teamId: 'other-team', source: AgentSkillSourceEnum.personal }
    });
    const args = { resources: [{ type, id: resourceId }], tmbId, isRoot: true };
    await expect(checkAppResourceReadPermissions(args)).rejects.toBe(error);
  });

  it('uses the authenticated target team instead of deriving the boundary from root membership', async () => {
    const resources = [{ type: 'dataset' as const, id: resourceId }];
    mocks.authDatasetByTmbId.mockResolvedValue({ dataset: { teamId: 'target-team' } });
    await expect(
      checkAppResourceReadPermissions({ resources, tmbId, teamId: 'target-team', isRoot: true })
    ).resolves.toBeUndefined();
    await expect(
      checkAppResourceReadPermissions({ resources, tmbId, teamId, isRoot: true })
    ).rejects.toBe(DatasetErrEnum.unAuthDataset);
  });

  it('keeps global system skills readable without enabling cross-team access', async () => {
    mocks.authSkillByTmbId.mockResolvedValue({ skill: { source: AgentSkillSourceEnum.system } });
    await expect(
      checkAppResourceReadPermissions({
        resources: [{ type: 'skill', id: resourceId }],
        tmbId,
        isRoot: true
      })
    ).resolves.toBeUndefined();
  });

  it('preserves ordinary member ACL checks', async () => {
    mocks.authDatasetByTmbId.mockRejectedValue(DatasetErrEnum.unAuthDataset);
    await expect(
      checkAppResourceReadPermissions({
        resources: [{ type: 'dataset', id: resourceId }],
        tmbId
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDataset);
    expect(mocks.authDatasetByTmbId).toHaveBeenCalledWith(
      expect.objectContaining({ tmbId, isRoot: false })
    );
  });
});
