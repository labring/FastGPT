import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

const {
  mockParseHeaderCert,
  mockGetCollectionWithDataset,
  mockFindDataset,
  mockGetTmbInfoByTmbId,
  mockGetTmbPermission
} = vi.hoisted(() => ({
  mockParseHeaderCert: vi.fn(),
  mockGetCollectionWithDataset: vi.fn(),
  mockFindDataset: vi.fn(),
  mockGetTmbInfoByTmbId: vi.fn(),
  mockGetTmbPermission: vi.fn()
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

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    findById: vi.fn()
  }
}));

import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';

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
    mockDatasetQuery({
      _id: datasetId,
      teamId: 'team-a',
      tmbId: 'tmb-a',
      inheritPermission: false
    });
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
});
