import listHandler from '@/pages/api/core/dataset/collection/listV2';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import pathsHandler from '@/pages/api/core/dataset/collection/paths';
import detailHandler from '@/pages/api/core/dataset/collection/detail';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('collection listV2 permission', () => {
  it('returns owner permission for the team owner on a collection owned by another member', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const dataset = await MongoDataset.create({
      name: 'team-owner-list-permission',
      teamId: users.owner.teamId,
      tmbId: member.tmbId,
      vectorModel: 'test',
      agentModel: 'test',
      collectionPermissionEnabled: true
    });
    const collection = await MongoDatasetCollection.create({
      name: 'owned-by-member',
      type: DatasetCollectionTypeEnum.file,
      teamId: users.owner.teamId,
      tmbId: member.tmbId,
      datasetId: dataset._id
    });

    const response = await Call(listHandler, {
      auth: users.owner,
      body: {
        datasetId: dataset._id,
        pageSize: 10,
        offset: 0,
        filterTags: []
      }
    });

    expect(response.code).toBe(200);
    // 列表返回权限必须与详情鉴权一致：团队 owner 短路为 owner，不能 cap 到 manage
    expect(
      response.data.list.find((item) => String(item._id) === String(collection._id))?.permission
    ).toMatchObject({
      role: OwnerRoleVal,
      hasManagePer: true
    });
  });
});

describe('collection listV2 navigation folders', () => {
  /** 构造：成员只对 root/folder/file 中的 file 有读权限，目录本身没有任何权限。 */
  const setup = async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const dataset = await MongoDataset.create({
      name: 'collection-navigation',
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      vectorModel: 'test',
      agentModel: 'test',
      collectionPermissionEnabled: true
    });
    const create = (name: string, type: DatasetCollectionTypeEnum, parentId: string | null) =>
      MongoDatasetCollection.create({
        name,
        type,
        parentId,
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        datasetId: dataset._id
      });
    const folder = await create('folder', DatasetCollectionTypeEnum.folder, null);
    const emptyFolder = await create('empty', DatasetCollectionTypeEnum.folder, null);
    const file = await create('file', DatasetCollectionTypeEnum.file, String(folder._id));
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: users.owner.teamId,
      resourceId: dataset._id,
      tmbId: member.tmbId,
      permission: ReadPermissionVal
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.collection,
      teamId: users.owner.teamId,
      resourceId: file._id,
      tmbId: member.tmbId,
      permission: ReadPermissionVal
    });
    return { member, dataset, folder, emptyFolder, file };
  };

  it('lists folders that lead to readable collections as navigation-only and hides empty ones', async () => {
    const { member, dataset, folder, emptyFolder } = await setup();

    const response = await Call(listHandler, {
      auth: member,
      body: { datasetId: dataset._id, pageSize: 10, offset: 0 }
    });

    expect(response.code).toBe(200);
    const ids = response.data.list.map((item) => String(item._id));
    expect(ids).toContain(String(folder._id));
    expect(ids).not.toContain(String(emptyFolder._id));
    const item = response.data.list.find((entry) => String(entry._id) === String(folder._id));
    expect(item?.folderAccessMode).toBe('navigate');
    expect(item?.permission.hasReadPer).toBe(false);
  });

  it('allows browsing into a navigation-only folder and lists its readable children', async () => {
    const { member, dataset, folder, file } = await setup();

    const response = await Call(listHandler, {
      auth: member,
      body: { datasetId: dataset._id, parentId: String(folder._id), pageSize: 10, offset: 0 }
    });

    expect(response.code).toBe(200);
    expect(response.data.list.map((item) => String(item._id))).toEqual([String(file._id)]);
  });

  it('rejects browsing into a folder without readable descendants', async () => {
    const { member, dataset, emptyFolder } = await setup();

    const response = await Call(listHandler, {
      auth: member,
      body: { datasetId: dataset._id, parentId: String(emptyFolder._id), pageSize: 10, offset: 0 }
    });

    expect(response.code).toBe(500);
  });

  it('marks the current path item as navigate but still rejects the folder detail', async () => {
    const { member, folder } = await setup();

    const paths = await Call(pathsHandler, {
      auth: member,
      query: { sourceId: String(folder._id) }
    });
    expect(paths.code).toBe(200);
    expect(paths.data).toEqual([
      { parentId: String(folder._id), parentName: 'folder', folderAccessMode: 'navigate' }
    ]);

    const detail = await Call(detailHandler, {
      auth: member,
      query: { id: String(folder._id) }
    });
    expect(detail.code).toBe(500);
  });
});
