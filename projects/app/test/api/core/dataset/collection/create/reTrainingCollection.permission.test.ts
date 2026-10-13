import retrainHandler from '@/pages/api/core/dataset/collection/create/reTrainingCollection';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

// delCollection 会调用 deleteDatasetFilesByKeys，而全局 s3 mock 未提供该方法；本地补齐。
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    createGetDatasetFileURL: vi.fn(),
    createUploadDatasetFileURL: vi.fn(),
    deleteDatasetFile: vi.fn(),
    deleteDatasetFilesByKeys: vi.fn()
  })
}));

/**
 * 建立启用 collection 权限的 dataset + 一个带自定义协作者的 collection。
 * collection 的 owner 与触发重训的协作者分离，用于验证重训不会丢掉协作者配置。
 */
const setupCollection = async ({
  teamId,
  owner,
  collaborator,
  inheritPermission
}: {
  teamId: string;
  owner: parseHeaderCertRet;
  collaborator: parseHeaderCertRet;
  inheritPermission: boolean;
}) => {
  const dataset = await MongoDataset.create({
    name: 'retrain-permission',
    type: DatasetTypeEnum.dataset,
    teamId,
    tmbId: owner.tmbId,
    agentModel: 'gpt-5',
    vectorModel: 'text-embedding-ada-002',
    collectionPermissionEnabled: true
  });
  const collection = await MongoDatasetCollection.create({
    name: 'file',
    type: DatasetCollectionTypeEnum.file,
    teamId,
    tmbId: owner.tmbId,
    datasetId: dataset._id,
    inheritPermission
  });

  await MongoResourcePermission.create([
    // 协作者先通过 dataset read 门槛
    {
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      resourceId: dataset._id,
      tmbId: collaborator.tmbId,
      permission: ReadRoleVal
    },
    {
      resourceType: PerResourceTypeEnum.collection,
      teamId,
      resourceId: collection._id,
      tmbId: owner.tmbId,
      permission: OwnerRoleVal
    },
    {
      resourceType: PerResourceTypeEnum.collection,
      teamId,
      resourceId: collection._id,
      tmbId: collaborator.tmbId,
      permission: WriteRoleVal
    }
  ]);

  return collection;
};

/** 集合 ACL 快照的可比较形式（协作者 + 权限位）。 */
const collectionPermissions = async ({
  teamId,
  collectionId
}: {
  teamId: string;
  collectionId: string;
}) => {
  const rows = await MongoResourcePermission.find(
    {
      resourceType: PerResourceTypeEnum.collection,
      teamId,
      resourceId: collectionId
    },
    'tmbId permission'
  ).lean();

  return rows.map((row) => `${String(row.tmbId)}:${row.permission}`).sort();
};

describe('reTrainingCollection permission carry over', () => {
  it('keeps an independent collection collaborators after retrain', async () => {
    const users = await getFakeUsers(2);
    const [owner, collaborator] = users.members;
    const teamId = users.owner.teamId;
    const collection = await setupCollection({
      teamId,
      owner,
      collaborator,
      inheritPermission: false
    });

    const before = await collectionPermissions({ teamId, collectionId: String(collection._id) });
    expect(before).toHaveLength(2);

    const response = await Call(retrainHandler, {
      auth: collaborator,
      body: { collectionId: String(collection._id) }
    });

    expect(response.code).toBe(200);
    const newCollectionId = response.data.collectionId;
    expect(newCollectionId).not.toBe(String(collection._id));

    const newCollection = await MongoDatasetCollection.findById(newCollectionId).lean();
    expect(newCollection?.inheritPermission).toBe(false);
    await expect(collectionPermissions({ teamId, collectionId: newCollectionId })).resolves.toEqual(
      before
    );
  });

  it('keeps own collaborators of an inheriting collection after retrain', async () => {
    const users = await getFakeUsers(2);
    const [owner, collaborator] = users.members;
    const teamId = users.owner.teamId;
    const collection = await setupCollection({
      teamId,
      owner,
      collaborator,
      inheritPermission: true
    });

    const before = await collectionPermissions({ teamId, collectionId: String(collection._id) });

    const response = await Call(retrainHandler, {
      auth: collaborator,
      body: { collectionId: String(collection._id) }
    });

    expect(response.code).toBe(200);
    const newCollectionId = response.data.collectionId;
    expect(newCollectionId).not.toBe(String(collection._id));

    await expect(collectionPermissions({ teamId, collectionId: newCollectionId })).resolves.toEqual(
      before
    );
  });
});
