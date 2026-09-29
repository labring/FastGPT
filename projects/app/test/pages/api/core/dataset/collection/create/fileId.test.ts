import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authDatasetCollectionCreate: vi.fn(),
  checkDatasetIndexLimit: vi.fn(),
  getFileMetadata: vi.fn(),
  createCollectionAndInsertData: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollectionCreate: mocks.authDatasetCollectionCreate
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    getFileMetadata: mocks.getFileMetadata
  })
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: mocks.checkDatasetIndexLimit
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createCollectionAndInsertData: mocks.createCollectionAndInsertData
}));

import handler from '@/pages/api/core/dataset/collection/create/fileId';

const datasetId = '507f1f77bcf86cd799439011';
const otherDatasetId = '507f1f77bcf86cd799439099';

const callHandler = (body: Record<string, unknown>) =>
  (handler as unknown as (req: ApiRequestProps) => Promise<unknown>)({ body } as ApiRequestProps);

describe('collection create from fileId key binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authDatasetCollectionCreate.mockResolvedValue({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      dataset: { _id: datasetId }
    });
    mocks.checkDatasetIndexLimit.mockResolvedValue(undefined);
    mocks.getFileMetadata.mockResolvedValue({ filename: 'demo.pdf' });
    mocks.createCollectionAndInsertData.mockResolvedValue({
      collectionId: '68ad85a7463006c963799440',
      results: { insertLen: 1 }
    });
  });

  // 漏洞回归：调用者只对自己的 dataset 有写权限，不能借他队对象的 key 把文件导入本队。
  it('rejects a dataset file key that belongs to another dataset before any S3 read', async () => {
    await expect(
      callHandler({ datasetId, fileId: `dataset/${otherDatasetId}/secret.pdf` })
    ).rejects.toBe(CommonErrEnum.unAuthFileKey);

    expect(mocks.getFileMetadata).not.toHaveBeenCalled();
    expect(mocks.createCollectionAndInsertData).not.toHaveBeenCalled();
  });

  it.each([
    ['another source prefix', 'chat/app-1/user-1/chat-1/secret.pdf'],
    ['a bare dataset prefix without filename', `dataset/${datasetId}`],
    ['a dataset id that only shares a prefix with the target', `dataset/${datasetId}extra/x.pdf`]
  ])('rejects %s', async (_, fileId) => {
    await expect(callHandler({ datasetId, fileId })).rejects.toBe(CommonErrEnum.unAuthFileKey);

    expect(mocks.getFileMetadata).not.toHaveBeenCalled();
    expect(mocks.createCollectionAndInsertData).not.toHaveBeenCalled();
  });

  it('ingests a file key that belongs to the authorized dataset', async () => {
    const fileId = `dataset/${datasetId}/demo.pdf`;

    await expect(callHandler({ datasetId, fileId })).resolves.toMatchObject({
      collectionId: '68ad85a7463006c963799440'
    });

    expect(mocks.getFileMetadata).toHaveBeenCalledWith(fileId);
    expect(mocks.createCollectionAndInsertData).toHaveBeenCalledWith(
      expect.objectContaining({
        createCollectionParams: expect.objectContaining({
          fileId,
          name: 'demo.pdf',
          teamId: 'team-a',
          tmbId: 'tmb-a'
        })
      })
    );
  });
});
