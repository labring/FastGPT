import enableHandler from '@/pages/api/core/dataset/enableCollectionPermission';
import disableHandler from '@/pages/api/core/dataset/disableCollectionPermission';
import resumeCollectionHandler from '@/pages/api/core/dataset/collection/resumeInheritPermission';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.mocked(addAuditLog).mockClear();
});

describe('collection permission audit', () => {
  it('开启/关闭集合权限分别写入审计', async () => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'switch-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId
    });
    await MongoDatasetCollection.create({
      name: 'switch-collection',
      type: DatasetCollectionTypeEnum.file,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id
    });

    const enabled = await Call(enableHandler, {
      auth: users.owner,
      body: { datasetId: String(dataset._id) }
    });
    expect(enabled.code).toBe(200);
    expect(addAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEventEnum.ENABLE_COLLECTION_PERMISSION,
        params: expect.objectContaining({
          datasetName: 'switch-dataset',
          collectionCount: 1
        })
      })
    );

    vi.mocked(addAuditLog).mockClear();
    const disabled = await Call(disableHandler, {
      auth: users.owner,
      body: { datasetId: String(dataset._id) }
    });
    expect(disabled.code).toBe(200);
    expect(addAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEventEnum.DISABLE_COLLECTION_PERMISSION,
        params: expect.objectContaining({
          datasetName: 'switch-dataset',
          collectionCount: 1
        })
      })
    );
  });

  it('集合恢复继承写入审计并落库', async () => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'resume-collection-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      collectionPermissionEnabled: true
    });
    const collection = await MongoDatasetCollection.create({
      name: 'independent-file',
      type: DatasetCollectionTypeEnum.file,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      inheritPermission: false
    });

    const res = await Call(resumeCollectionHandler, {
      auth: users.owner,
      body: { collectionId: String(collection._id) }
    });

    expect(res.code).toBe(200);
    expect(addAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEventEnum.RESUME_COLLECTION_INHERIT_PERMISSION,
        params: expect.objectContaining({
          collectionName: 'independent-file',
          datasetName: 'resume-collection-dataset'
        })
      })
    );
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toMatchObject({
      inheritPermission: true
    });
  });
});
