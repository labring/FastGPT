import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

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

describe('checkAppResourceReadPermissions', () => {
  const validTmbId = '65f000000000000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTmbInfoByTmbId.mockResolvedValue({
      teamId: '65f000000000000000000002',
      permission: { isOwner: false }
    });
  });

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    mocks.authAppByTmbId.mockResolvedValue(undefined);
    mocks.authDatasetByTmbId.mockResolvedValue(undefined);

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
    mocks.authAppByTmbId.mockResolvedValue(undefined);
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
    mocks.authDatasetByTmbId.mockResolvedValue(undefined);

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
