import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  ManagePermissionVal,
  ManageRoleVal,
  OwnerPermissionVal,
  OwnerRoleVal,
  ReadPermissionVal,
  ReadRoleVal,
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
import type { NodeHttpRequest } from '@fastgpt/service/types/http';

/** parseHeaderCert 已被 mock，请求对象仅作占位；测试关注的是鉴权分支而非请求内容。 */
const mockReq = {} as unknown as NodeHttpRequest;

const datasetId = '507f1f77bcf86cd799439011';
const collectionId = '507f1f77bcf86cd799439012';

const mockDatasetQuery = (dataset: Record<string, unknown>) => {
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

  it('rejects with unExist when dataset does not exist or is soft deleted', async () => {
    mockFindDataset.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });

    await expect(
      authDatasetByTmbId({
        tmbId: 'tmb-a',
        datasetId,
        per: ReadPermissionVal
      })
    ).rejects.toBe(DatasetErrEnum.unExist);
    expect(mockFindDataset).toHaveBeenCalledWith({ _id: datasetId, deleteTime: null });
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
        mockReq,
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
      mockReq,
      authToken: true,
      collectionId,
      per: ReadPermissionVal
    });

    expect(result.collection._id).toBe(collectionId);
  });

  it('keeps owner for a dataset owner who also owns the collection in disabled mode', async () => {
    // 非团队 owner，走关闭态短路分支（collectionPermissionEnabled 非 true）
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false }
    });
    // 当前用户是 dataset owner（tmbId 匹配），且 dataset 处于关闭态
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-a',
      collectionPermissionEnabled: false
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
      mockReq,
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

  it('does not grant collection manage to a team manager in enabled mode', async () => {
    // 团队管理员：团队级 manage 不覆盖业务资源，必须按 collection 物化快照解析。
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false, hasManagePer: true }
    });
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-other',
      collectionPermissionEnabled: true
    });
    mockGetCollectionWithDataset.mockResolvedValue({
      _id: collectionId,
      teamId: 'team-a',
      datasetId,
      tmbId: 'tmb-other'
    });
    // dataset read 门槛通过；collection 快照仅授予 read
    mockGetTmbPermission.mockResolvedValue(ReadPermissionVal);
    mockResolveCollectionPermission.mockResolvedValue(ReadRoleVal);

    const result = await authDatasetCollection({
      mockReq,
      authToken: true,
      collectionId,
      per: ReadPermissionVal
    });
    expect(result.permission.role).toBe(ReadRoleVal);

    await expect(
      authDatasetCollection({
        mockReq,
        authToken: true,
        collectionId,
        per: ManagePermissionVal
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
    expect(mockResolveCollectionPermission).toHaveBeenCalled();
  });

  it('caps a dataset owner who does not own the collection to manage in disabled mode', async () => {
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false }
    });
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-a',
      collectionPermissionEnabled: false
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
      mockReq,
      authToken: true,
      collectionId,
      per: ReadPermissionVal
    });

    expect(result.permission.role).toBe(ManageRoleVal);
    expect(result.permission.checkPer(OwnerPermissionVal)).toBe(false);
    expect(mockResolveCollectionPermission).not.toHaveBeenCalled();
  });

  it('grants the team owner owner role on a collection owned by another member', async () => {
    // 团队 owner 短路为 owner：changeOwner 等 owner 专属操作不能因 cap 到 manage 被误拒
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: true }
    });
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-other',
      collectionPermissionEnabled: true
    });
    mockGetCollectionWithDataset.mockResolvedValue({
      _id: collectionId,
      teamId: 'team-a',
      datasetId,
      tmbId: 'tmb-other'
    });

    const result = await authDatasetCollection({
      mockReq,
      authToken: true,
      collectionId,
      per: OwnerPermissionVal
    });

    expect(result.permission.role).toBe(OwnerRoleVal);
    expect(result.permission.checkPer(OwnerPermissionVal)).toBe(true);
    // 短路生效：启用态下也不读物化快照
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
        mockReq,
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
        mockReq,
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
        mockReq,
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
      mockReq,
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
        mockReq,
        authToken: true,
        fileId: `dataset/${datasetId}/secret.pdf`,
        per: OwnerPermissionVal
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDataset);

    expect(mockIsObjectExists).not.toHaveBeenCalled();
  });
});
