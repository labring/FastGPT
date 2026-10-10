import createCollectionHandler from '@/pages/api/core/dataset/collection/create';
import {
  ApiCreateCollectionBaseSchema,
  CreateApiCollectionBodySchema,
  CreateApiCollectionV2BodySchema,
  CreateCollectionBodySchema,
  CreateCollectionByFileIdBodySchema,
  CreateCollectionByLocalFileBodySchema,
  CreateExternalFileCollectionBodySchema,
  CreateImageCollectionDataSchema,
  CreateLinkCollectionBodySchema,
  CreateTextCollectionBodySchema,
  ReTrainingCollectionBodySchema,
  type CreateCollectionBodyType,
  type CreateCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

/** 建启用 collection 权限的 dataset + 一个 read 协作者：子集合是否合并父级快照可直接观察。 */
const setupDataset = async () => {
  const users = await getFakeUsers(2);
  const [owner, collaborator] = users.members;
  const teamId = users.owner.teamId;
  const dataset = await MongoDataset.create({
    name: 'inherit-permission',
    type: DatasetTypeEnum.dataset,
    teamId,
    tmbId: owner.tmbId,
    agentModel: 'gpt-5',
    vectorModel: 'text-embedding-ada-002',
    collectionPermissionEnabled: true
  });
  await MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.dataset,
    teamId,
    resourceId: dataset._id,
    tmbId: collaborator.tmbId,
    permission: ReadRoleVal
  });
  return { owner, collaborator, teamId, dataset };
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
    { resourceType: PerResourceTypeEnum.collection, teamId, resourceId: collectionId },
    'tmbId permission'
  ).lean();
  return rows.map((row) => `${String(row.tmbId)}:${row.permission}`).sort();
};

const createCollection = async ({
  owner,
  datasetId,
  type,
  inheritPermission
}: {
  owner: parseHeaderCertRet;
  datasetId: string;
  type: CreateCollectionBodyType['type'];
  inheritPermission?: boolean;
}) => {
  const res = await Call<
    CreateCollectionBodyType,
    Record<string, never>,
    CreateCollectionResponseType
  >(createCollectionHandler, {
    auth: owner,
    body: { datasetId, name: 'child', type, inheritPermission }
  });
  const collection = await MongoDatasetCollection.findById(res.data).lean();
  return { res, collection };
};

describe('create collection inheritPermission', () => {
  it('parses an omitted inheritPermission as true', () => {
    expect(
      CreateCollectionBodySchema.parse({
        datasetId: 'dataset-id',
        name: 'folder',
        type: DatasetCollectionTypeEnum.folder
      }).inheritPermission
    ).toBe(true);
  });

  it('writes only the owner snapshot for an independent folder', async () => {
    const { owner, teamId, dataset } = await setupDataset();

    const { res, collection } = await createCollection({
      owner,
      datasetId: String(dataset._id),
      type: DatasetCollectionTypeEnum.folder,
      inheritPermission: false
    });

    expect(res.code).toBe(200);
    expect(collection?.inheritPermission).toBe(false);
    await expect(
      collectionPermissions({ teamId, collectionId: String(collection?._id) })
    ).resolves.toEqual([`${String(owner.tmbId)}:${OwnerRoleVal}`]);
  });

  it('merges the dataset snapshot for a folder that omits the flag', async () => {
    const { owner, collaborator, teamId, dataset } = await setupDataset();

    const { res, collection } = await createCollection({
      owner,
      datasetId: String(dataset._id),
      type: DatasetCollectionTypeEnum.folder
    });

    expect(res.code).toBe(200);
    expect(collection?.inheritPermission).toBe(true);
    await expect(
      collectionPermissions({ teamId, collectionId: String(collection?._id) })
    ).resolves.toEqual(
      [
        `${String(owner.tmbId)}:${OwnerRoleVal}`,
        `${String(collaborator.tmbId)}:${ReadRoleVal}`
      ].sort()
    );
  });

  // 非文件夹类型忽略该参数（不报错），落库与 ACL 都回到默认继承态。
  it('ignores the flag for a non-folder collection', async () => {
    const { owner, collaborator, teamId, dataset } = await setupDataset();

    const { res, collection } = await createCollection({
      owner,
      datasetId: String(dataset._id),
      type: DatasetCollectionTypeEnum.virtual,
      inheritPermission: false
    });

    expect(res.code).toBe(200);
    expect(collection?.inheritPermission).toBe(true);
    await expect(
      collectionPermissions({ teamId, collectionId: String(collection?._id) })
    ).resolves.toEqual(
      [
        `${String(owner.tmbId)}:${OwnerRoleVal}`,
        `${String(collaborator.tmbId)}:${ReadRoleVal}`
      ].sort()
    );
  });
});

describe('inheritPermission request schema surface', () => {
  it('declares the flag on folder-capable and service-facing schemas only', () => {
    // 文件夹创建要用；ApiCreateCollectionBaseSchema 同时是 service 入参类型，必须保留。
    expect(ApiCreateCollectionBaseSchema.shape).toHaveProperty('inheritPermission');

    for (const schema of [
      CreateCollectionByFileIdBodySchema,
      CreateCollectionByLocalFileBodySchema,
      CreateLinkCollectionBodySchema,
      CreateTextCollectionBodySchema,
      CreateApiCollectionBodySchema,
      CreateApiCollectionV2BodySchema,
      CreateImageCollectionDataSchema,
      CreateExternalFileCollectionBodySchema,
      ReTrainingCollectionBodySchema
    ]) {
      expect(schema.shape).not.toHaveProperty('inheritPermission');
    }
  });
});
