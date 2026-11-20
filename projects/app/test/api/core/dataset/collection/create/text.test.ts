import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AuditResourceTypeEnum } from '@fastgpt/global/support/user/audit/type';

const {
  mockAuthDatasetCollectionCreate,
  mockGetDatasetModelAuthContext,
  mockCheckDatasetIndexLimit,
  mockUpload,
  mockCreateCollectionAndInsertData,
  mockRemoveS3TTL,
  mockAddAuditLog,
  mockGetDatasetCollectionPaths,
  modelAuthContext
} = vi.hoisted(() => ({
  mockAuthDatasetCollectionCreate: vi.fn(),
  mockGetDatasetModelAuthContext: vi.fn(),
  mockCheckDatasetIndexLimit: vi.fn(),
  mockUpload: vi.fn(),
  mockCreateCollectionAndInsertData: vi.fn(),
  mockRemoveS3TTL: vi.fn(),
  mockAddAuditLog: vi.fn(),
  mockGetDatasetCollectionPaths: vi.fn(),
  modelAuthContext: { modelHandle: {}, authorizedIds: new Set<string>() }
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollectionCreate: mockAuthDatasetCollectionCreate
}));

vi.mock('@fastgpt/service/core/dataset/model', () => ({
  getDatasetModelAuthContext: mockGetDatasetModelAuthContext
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: mockCheckDatasetIndexLimit
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    upload: mockUpload
  })
}));

vi.mock('@fastgpt/service/common/s3/utils', () => ({
  removeS3TTL: mockRemoveS3TTL
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createCollectionAndInsertData: mockCreateCollectionAndInsertData
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: mockAddAuditLog
}));

vi.mock('@fastgpt/service/core/dataset/collection/paths', () => ({
  getDatasetCollectionPaths: mockGetDatasetCollectionPaths
}));

import textHandler from '@/pages/api/core/dataset/collection/create/text';

describe('dataset collection create/text audit snapshot', () => {
  const datasetId = '507f1f77bcf86cd799439011';
  const collectionId = '507f1f77bcf86cd799439012';
  const parentId = '507f1f77bcf86cd799439013';

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthDatasetCollectionCreate.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      isRoot: false,
      dataset: {
        _id: datasetId,
        teamId: 'team-id',
        name: '产品手册'
      }
    });
    mockGetDatasetModelAuthContext.mockResolvedValue(modelAuthContext);
    mockCheckDatasetIndexLimit.mockResolvedValue(undefined);
    mockUpload.mockResolvedValue('dataset/key/intro.txt');
    mockCreateCollectionAndInsertData.mockResolvedValue({
      collectionId,
      results: { insertLen: 1 }
    });
    mockRemoveS3TTL.mockResolvedValue(undefined);
    mockAddAuditLog.mockResolvedValue(undefined);
    mockGetDatasetCollectionPaths.mockResolvedValue([{ parentId, parentName: '快速开始' }]);
  });

  it('records the same file collectionType in createCollectionAndInsertData and audit log', async () => {
    const res = await textHandler({
      body: {
        datasetId,
        parentId,
        name: '接入说明',
        text: 'hello fastgpt'
      }
    } as never);

    expect(res).toEqual({
      collectionId,
      results: { insertLen: 1 }
    });

    const createCall = mockCreateCollectionAndInsertData.mock.calls[0]?.[0];
    const auditCall = mockAddAuditLog.mock.calls[0]?.[0];

    expect(createCall.createCollectionParams.type).toBe(DatasetCollectionTypeEnum.file);
    expect(auditCall).toEqual({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      event: DatasetAuditEventEnum.DATASET_COLLECTION_CREATE,
      resources: [
        {
          type: AuditResourceTypeEnum.collection,
          id: collectionId,
          name: '接入说明.txt',
          datasetId,
          collectionType: createCall.createCollectionParams.type
        }
      ],
      params: {
        objectType: 'common:core.dataset.file',
        location: '产品手册/快速开始'
      }
    });
  });
});
