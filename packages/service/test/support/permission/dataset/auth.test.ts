import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  ManageRoleVal,
  OwnerPermissionVal,
  OwnerRoleVal,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';

const {
  mockParseHeaderCert,
  mockGetCollectionWithDataset,
  mockFindDataset,
  mockGetTmbInfoByTmbId,
  mockGetTmbPermission,
  mockIsObjectExists,
  mockResolveCollectionPermission
} = vi.hoisted(() => ({
  mockParseHeaderCert: vi.fn(),
  mockGetCollectionWithDataset: vi.fn(),
  mockFindDataset: vi.fn(),
  mockGetTmbInfoByTmbId: vi.fn(),
  mockGetTmbPermission: vi.fn(),
  mockIsObjectExists: vi.fn(),
  mockResolveCollectionPermission: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  parseHeaderCert: mockParseHeaderCert
}));

vi.mock('@fastgpt/service/core/dataset/controller', () => ({
  getCollectionWithDataset: mockGetCollectionWithDataset
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    findOne: mockFindDataset
  }
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: mockGetTmbInfoByTmbId
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  getTmbPermission: mockGetTmbPermission
}));

vi.mock('@fastgpt/service/support/permission/collection/auth', () => ({
  resolveCollectionPermission: mockResolveCollectionPermission
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    isObjectExists: mockIsObjectExists
  })
}));

import {
  authDatasetByTmbId,
  authDatasetCollection,
  authDatasetCollectionCreate
} from '@fastgpt/service/support/permission/dataset/auth';
import { authCollectionFile } from '@fastgpt/service/support/permission/auth/file';

const datasetId = '507f1f77bcf86cd799439011';
const collectionId = '507f1f77bcf86cd799439012';

const mockDatasetQuery = (dataset: Record<string, any>) => {
  mockFindDataset.mockReturnValue({
    lean: vi.fn().mockResolvedValue(dataset)
  });
};

describe('authDatasetCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseHeaderCert.mockResolvedValue({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      userId: 'user-a',
      isRoot: false
    });
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: true }
    });
    mockGetTmbPermission.mockResolvedValue(0);
    mockResolveCollectionPermission.mockResolvedValue(0);
    mockIsObjectExists.mockResolvedValue(true);
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-a',
      inheritPermission: false
    });
  });

  it('authorizes a member from the dataset ACL and rejects a stronger permission', async () => {
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false }
    });
    mockGetTmbPermission.mockResolvedValue(ReadPermissionVal);
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-owner',
      inheritPermission: true
    });

    await expect(
      authDatasetByTmbId({
        tmbId: 'tmb-a',
        datasetId,
        per: ReadPermissionVal
      })
    ).resolves.toMatchObject({
      dataset: { permission: { hasReadPer: true, isOwner: false } }
    });
    await expect(
      authDatasetByTmbId({
        tmbId: 'tmb-a',
        datasetId,
        per: OwnerPermissionVal
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDataset);
  });

  it('falls back to the parent ACL for an inherited dataset', async () => {
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false }
    });
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-owner',
      parentId: 'parent-id',
      inheritPermission: true
    });
    mockGetTmbPermission.mockResolvedValueOnce(ReadPermissionVal).mockResolvedValueOnce(0);

    await expect(
      authDatasetByTmbId({ tmbId: 'tmb-a', datasetId, per: ReadPermissionVal })
    ).resolves.toMatchObject({ dataset: { permission: { hasReadPer: true } } });
  });

  it('allows root access without requiring the dataset team to match', async () => {
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false }
    });
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-b',
      tmbId: 'tmb-b',
      inheritPermission: false
    });

    await expect(
      authDatasetByTmbId({
        tmbId: 'root-tmb',
        datasetId,
        per: OwnerPermissionVal,
        isRoot: true
      })
    ).resolves.toMatchObject({ dataset: { permission: { isOwner: true } } });
    expect(mockGetTmbPermission).not.toHaveBeenCalled();
  });

  it('rejects a collection whose team does not match its dataset team', async () => {
    mockGetCollectionWithDataset.mockResolvedValue({
      _id: collectionId,
      teamId: 'team-b',
      datasetId
    });

    await expect(
      authDatasetCollection({
        req: {} as any,
        authToken: true,
        collectionId,
        per: ReadPermissionVal
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDataset);
  });

  it('allows a collection whose team matches its dataset team', async () => {
    mockGetCollectionWithDataset.mockResolvedValue({
      _id: collectionId,
      teamId: 'team-a',
      datasetId
    });

    const result = await authDatasetCollection({
      req: {} as any,
      authToken: true,
      collectionId,
      per: ReadPermissionVal
    });

    expect(result.collection._id).toBe(collectionId);
  });

  it('keeps owner for a dataset owner who also owns the collection in pure-inherit mode', async () => {
    // 非团队 owner/admin，走纯继承短路分支（flag 非 true）
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false }
    });
    // 当前用户是 dataset owner（tmbId 匹配），且 dataset 未配置 collection 权限
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-a',
      hasSetCollectionPermissions: false
    });
    // 当前用户也是 collection owner
    mockGetCollectionWithDataset.mockResolvedValue({
      _id: collectionId,
      teamId: 'team-a',
      datasetId,
      tmbId: 'tmb-a'
    });
    mockGetTmbPermission.mockResolvedValue(ReadPermissionVal);

    const result = await authDatasetCollection({
      req: {} as any,
      authToken: true,
      collectionId,
      per: OwnerPermissionVal
    });

    // 短路分支必须与物化快照直读语义一致：collection owner 拿到 OwnerRoleVal 而非被 cap 为 manage
    expect(result.permission.role).toBe(OwnerRoleVal);
    expect(result.permission.checkPer(OwnerPermissionVal)).toBe(true);
    // 短路生效：未走物化快照解析
    expect(mockResolveCollectionPermission).not.toHaveBeenCalled();
  });

  it('caps a dataset owner who does not own the collection to manage in pure-inherit mode', async () => {
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false }
    });
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-a',
      hasSetCollectionPermissions: false
    });
    // collection owner 是他人，dataset owner 仅从父级继承 manage
    mockGetCollectionWithDataset.mockResolvedValue({
      _id: collectionId,
      teamId: 'team-a',
      datasetId,
      tmbId: 'tmb-other'
    });
    mockGetTmbPermission.mockResolvedValue(ReadPermissionVal);

    const result = await authDatasetCollection({
      req: {} as any,
      authToken: true,
      collectionId,
      per: ReadPermissionVal
    });

    expect(result.permission.role).toBe(ManageRoleVal);
    expect(result.permission.checkPer(OwnerPermissionVal)).toBe(false);
    expect(mockResolveCollectionPermission).not.toHaveBeenCalled();
  });
});

describe('authDatasetCollectionCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseHeaderCert.mockResolvedValue({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      userId: 'user-a',
      isRoot: false
    });
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false }
    });
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-owner',
      inheritPermission: false
    });
  });

  it('requires dataset write permission when creating at the root', async () => {
    mockGetTmbPermission.mockResolvedValue(WritePermissionVal);

    await expect(
      authDatasetCollectionCreate({
        req: {} as any,
        authToken: true,
        datasetId
      })
    ).resolves.toMatchObject({ dataset: { _id: datasetId } });
    expect(mockGetCollectionWithDataset).not.toHaveBeenCalled();
  });

  it('uses the parent collection write permission for nested creation', async () => {
    mockGetCollectionWithDataset.mockResolvedValue({
      _id: collectionId,
      teamId: 'team-a',
      datasetId,
      tmbId: 'tmb-owner'
    });
    mockGetTmbPermission.mockResolvedValue(WritePermissionVal);

    await expect(
      authDatasetCollectionCreate({
        req: {} as any,
        authToken: true,
        datasetId,
        parentId: collectionId
      })
    ).resolves.toMatchObject({ collection: { _id: collectionId } });
  });

  it('rejects a parent collection from another dataset', async () => {
    mockGetCollectionWithDataset.mockResolvedValue({
      _id: collectionId,
      teamId: 'team-a',
      datasetId: 'another-dataset',
      tmbId: 'tmb-owner'
    });
    mockGetTmbPermission.mockResolvedValue(WritePermissionVal);

    await expect(
      authDatasetCollectionCreate({
        req: {} as any,
        authToken: true,
        datasetId,
        parentId: collectionId
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
  });
});

describe('authCollectionFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseHeaderCert.mockResolvedValue({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      userId: 'user-a',
      isRoot: false
    });
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: true }
    });
    mockGetTmbPermission.mockResolvedValue(0);
    mockIsObjectExists.mockResolvedValue(true);
  });

  it('authorizes a dataset file through the dataset id embedded in the key', async () => {
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-a',
      inheritPermission: false
    });

    const result = await authCollectionFile({
      req: {} as any,
      authToken: true,
      fileId: `dataset/${datasetId}/demo.pdf`,
      per: OwnerPermissionVal
    });

    expect(result.teamId).toBe('team-a');
    expect(mockIsObjectExists).toHaveBeenCalledWith(`dataset/${datasetId}/demo.pdf`);
  });

  it('rejects a dataset file key that belongs to another team', async () => {
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-b',
      tmbId: 'tmb-b',
      inheritPermission: false
    });

    await expect(
      authCollectionFile({
        req: {} as any,
        authToken: true,
        fileId: `dataset/${datasetId}/secret.pdf`,
        per: OwnerPermissionVal
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDataset);

    expect(mockIsObjectExists).not.toHaveBeenCalled();
  });
});
