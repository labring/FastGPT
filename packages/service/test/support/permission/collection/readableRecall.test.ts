import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { resolveReadableCollectionIds } from '@fastgpt/service/support/permission/collection/auth';
import { createCollectionPermission } from '@fastgpt/service/support/permission/collection/controller';
import { enableDatasetCollectionPermissions } from '@fastgpt/service/support/permission/collection/enable';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { describe, expect, it } from 'vitest';

/**
 * NFR-8（越权召回 = 0）：检索前置的「可读 collection 集合」解析。
 *
 * `resolveReadableCollectionIds` 是检索唯一授权集合来源，契约：
 *  - `undefined`：无需 collection 级过滤（关闭态短路 / 团队 owner / 可读集合覆盖全部候选）；
 *  - `string[]`：真子集，只能召回这些 file collection；
 *  - `[]`：无可读集合 → 召回侧必须返回空结果（`multiQueryRecall` 直接短路不查库）。
 */

type User = parseHeaderCertRet;

const createDataset = async ({ user }: { user: User }) =>
  mongoSessionRun(async (session) => {
    const dataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      type: DatasetTypeEnum.dataset,
      name: 'readable-recall-dataset'
    });
    await createResourceDefaultCollaborators({
      resource: {
        _id: String(dataset._id),
        type: dataset.type,
        teamId: String(dataset.teamId)
      },
      resourceType: PerResourceTypeEnum.dataset,
      session,
      tmbId: String(user.tmbId)
    });
    return dataset;
  });

const createCollection = async ({
  user,
  datasetId,
  name,
  type = DatasetCollectionTypeEnum.file
}: {
  user: User;
  datasetId: string;
  name: string;
  type?: DatasetCollectionTypeEnum;
}) =>
  mongoSessionRun(async (session) => {
    const collection = await MongoDatasetCollection.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      datasetId,
      type,
      name
    });
    await createCollectionPermission({
      resource: {
        _id: String(collection._id),
        type: collection.type,
        teamId: String(collection.teamId),
        parentId: collection.parentId ? String(collection.parentId) : undefined,
        datasetId: String(collection.datasetId),
        tmbId: String(collection.tmbId),
        inheritPermission: collection.inheritPermission
      },
      tmbId: String(user.tmbId),
      session
    });
    return collection;
  });

/** 直接写 ACL 行，模拟「成员对该 file collection 有个人 read 权限」。 */
const grantCollectionRead = ({
  teamId,
  collectionId,
  tmbId
}: {
  teamId: string;
  collectionId: string;
  tmbId: string;
}) =>
  MongoResourcePermission.create({
    teamId,
    resourceType: PerResourceTypeEnum.collection,
    resourceId: collectionId,
    tmbId,
    permission: ReadRoleVal
  });

describe.sequential('resolveReadableCollectionIds', () => {
  it('skips collection filtering while the dataset switch is disabled', async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    await createCollection({ user: users.owner, datasetId, name: 'file-a' });
    await createCollection({ user: users.owner, datasetId, name: 'file-b' });

    // 关闭态（默认）：读路径短路到 dataset 有效权限，不做 collection 级过滤。
    await expect(
      resolveReadableCollectionIds({
        teamId,
        datasetIds: [datasetId],
        tmbId: String(users.members[0].tmbId)
      })
    ).resolves.toBeUndefined();
  });

  it('returns only the readable file collections for a member', async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    const readableFile = await createCollection({ user: users.owner, datasetId, name: 'readable' });
    const hiddenFile = await createCollection({ user: users.owner, datasetId, name: 'hidden' });
    const folder = await createCollection({
      user: users.owner,
      datasetId,
      name: 'folder',
      type: DatasetCollectionTypeEnum.folder
    });

    await enableDatasetCollectionPermissions({ teamId, datasetId });
    await grantCollectionRead({
      teamId,
      collectionId: String(readableFile._id),
      tmbId: String(users.members[0].tmbId)
    });

    const readableIds = await resolveReadableCollectionIds({
      teamId,
      datasetIds: [datasetId],
      tmbId: String(users.members[0].tmbId)
    });

    // 真子集只包含获授权的 file collection：不可读文件与 folder 都不在授权集合内。
    expect(readableIds).toEqual([String(readableFile._id)]);
    expect(readableIds).not.toContain(String(hiddenFile._id));
    expect(readableIds).not.toContain(String(folder._id));
  });

  it('returns an empty readable set when the member can read no file collection', async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    await createCollection({ user: users.owner, datasetId, name: 'file-a' });
    await createCollection({ user: users.owner, datasetId, name: 'file-b' });

    await enableDatasetCollectionPermissions({ teamId, datasetId });

    // 空数组 = 无可读集合：检索侧据此直接返回空结果（不回退为「全部可读」）。
    await expect(
      resolveReadableCollectionIds({
        teamId,
        datasetIds: [datasetId],
        tmbId: String(users.members[0].tmbId)
      })
    ).resolves.toEqual([]);
  });

  it('skips filtering when the member can read every file collection', async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    const fileA = await createCollection({ user: users.owner, datasetId, name: 'file-a' });
    const fileB = await createCollection({ user: users.owner, datasetId, name: 'file-b' });

    await enableDatasetCollectionPermissions({ teamId, datasetId });
    await grantCollectionRead({
      teamId,
      collectionId: String(fileA._id),
      tmbId: String(users.members[0].tmbId)
    });
    await grantCollectionRead({
      teamId,
      collectionId: String(fileB._id),
      tmbId: String(users.members[0].tmbId)
    });

    // 可读并集覆盖全部 file collection → undefined（避免下发上万 ID 的长过滤条件）。
    await expect(
      resolveReadableCollectionIds({
        teamId,
        datasetIds: [datasetId],
        tmbId: String(users.members[0].tmbId)
      })
    ).resolves.toBeUndefined();
  });

  it('skips collection filtering for a team owner', async () => {
    const users = await getFakeUsers(1);
    const teamId = String(users.owner.teamId);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    await createCollection({ user: users.owner, datasetId, name: 'file-a' });

    await enableDatasetCollectionPermissions({ teamId, datasetId });

    await expect(
      resolveReadableCollectionIds({
        teamId,
        datasetIds: [datasetId],
        tmbId: String(users.owner.tmbId)
      })
    ).resolves.toBeUndefined();
  });

  it('filters collection ACL for a team manager instead of bypassing it', async () => {
    const users = await getFakeUsers(1);
    const teamId = String(users.owner.teamId);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    const grantedFile = await createCollection({ user: users.owner, datasetId, name: 'granted' });
    await createCollection({ user: users.owner, datasetId, name: 'hidden' });

    await enableDatasetCollectionPermissions({ teamId, datasetId });
    await grantCollectionRead({
      teamId,
      collectionId: String(grantedFile._id),
      tmbId: String(users.manager.tmbId)
    });

    // 团队管理员（hasManagePer）没有 collection 级旁路：只能召回被显式授权的文件。
    await expect(
      resolveReadableCollectionIds({
        teamId,
        datasetIds: [datasetId],
        tmbId: String(users.manager.tmbId)
      })
    ).resolves.toEqual([String(grantedFile._id)]);
  });
});
