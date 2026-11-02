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
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { getFakeUsers, getRootUser } from '@test/datas/users';
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

  it('does not mark the creator as owner under permission sync', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const dataset = await MongoDataset.create({
      name: 'permission-sync-list',
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      vectorModel: 'test',
      agentModel: 'test',
      collectionPermissionEnabled: true,
      apiDatasetServer: {
        apiServer: { baseUrl: 'https://example.com' },
        permissionSync: true
      }
    });
    const collection = await MongoDatasetCollection.create({
      name: 'owned-by-member',
      type: DatasetCollectionTypeEnum.file,
      teamId: users.owner.teamId,
      tmbId: member.tmbId,
      datasetId: dataset._id
    });
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: users.owner.teamId,
        resourceId: dataset._id,
        tmbId: member.tmbId,
        permission: ReadPermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: users.owner.teamId,
        resourceId: collection._id,
        tmbId: member.tmbId,
        permission: ReadPermissionVal
      }
    ]);

    const response = await Call(listHandler, {
      auth: member,
      body: { datasetId: dataset._id, pageSize: 10, offset: 0 }
    });

    expect(response.code).toBe(200);
    // 托管模式下创建者身份不是授权来源：只有 ACL 里的 read
    expect(
      response.data.list.find((item) => String(item._id) === String(collection._id))?.permission
    ).toMatchObject({
      isOwner: false,
      hasReadPer: true,
      hasManagePer: false
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

describe('collection listV2 sort', () => {
  const createFixture = async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'collection-sort',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const createCollection = (name: string, extra: Record<string, unknown> = {}) =>
      MongoDatasetCollection.create({
        name,
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        ...extra
      });
    const list = async (body: Record<string, unknown>) => {
      const response = await Call(listHandler, {
        auth: root,
        body: { datasetId: dataset._id, pageSize: 10, offset: 0, ...body }
      });
      expect(response.code).toBe(200);
      return response.data.list as Array<{ _id: string; name: string }>;
    };

    return { root, dataset, createCollection, list };
  };

  it('sorts by name/createTime/updateTime, and defaults to updateTime desc', async () => {
    const { createCollection, list } = await createFixture();
    await createCollection('banana', {
      createTime: new Date('2026-01-02T00:00:00Z'),
      updateTime: new Date('2026-01-03T00:00:00Z')
    });
    await createCollection('Apple', {
      createTime: new Date('2026-01-01T00:00:00Z'),
      updateTime: new Date('2026-01-04T00:00:00Z')
    });
    await createCollection('cherry', {
      createTime: new Date('2026-01-03T00:00:00Z'),
      updateTime: new Date('2026-01-02T00:00:00Z')
    });

    const names = async (body: Record<string, unknown> = {}) =>
      (await list(body)).map((item) => item.name);

    expect(await names({ sortBy: 'name', sortOrder: 'asc' })).toEqual([
      'Apple',
      'banana',
      'cherry'
    ]);
    expect(await names({ sortBy: 'name', sortOrder: 'desc' })).toEqual([
      'cherry',
      'banana',
      'Apple'
    ]);
    expect(await names({ sortBy: 'createTime', sortOrder: 'asc' })).toEqual([
      'Apple',
      'banana',
      'cherry'
    ]);
    expect(await names({ sortBy: 'createTime', sortOrder: 'desc' })).toEqual([
      'cherry',
      'banana',
      'Apple'
    ]);
    expect(await names({ sortBy: 'updateTime', sortOrder: 'asc' })).toEqual([
      'cherry',
      'banana',
      'Apple'
    ]);
    // 默认 updateTime desc
    expect(await names()).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('supports sorting in simple mode', async () => {
    const { createCollection, list } = await createFixture();
    await createCollection('beta');
    await createCollection('alpha');

    const names = (await list({ simple: true, sortBy: 'name', sortOrder: 'asc' })).map(
      (item) => item.name
    );
    expect(names).toEqual(['alpha', 'beta']);
  });

  it.each([false, true])('keeps equal-name pagination stable (simple=%s)', async (simple) => {
    const { root, dataset, createCollection } = await createFixture();
    const sameNameCollections = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        createCollection(['Apple.txt', 'apple.txt', 'APPLE.txt'][index % 3])
      )
    );
    const first = await createCollection('alpha.txt');
    const last = await createCollection('zulu.txt');
    const ascendingIds = [
      String(first._id),
      ...sameNameCollections.map(({ _id }) => String(_id)).sort(),
      String(last._id)
    ];

    for (const sortOrder of ['asc', 'desc'] as const) {
      const actualIds: string[] = [];
      for (let offset = 0; offset < ascendingIds.length; offset += 2) {
        const response = await Call(listHandler, {
          auth: root,
          body: {
            datasetId: String(dataset._id),
            sortBy: 'name',
            sortOrder,
            simple,
            offset,
            pageSize: 2
          }
        });
        expect(response.code).toBe(200);
        expect(response.data.total).toBe(ascendingIds.length);
        actualIds.push(...response.data.list.map((item: { _id: string }) => String(item._id)));
      }

      // 同时验证主排序、同名记录的固定顺序，以及跨页没有重复或遗漏。
      expect(actualIds).toEqual(sortOrder === 'asc' ? ascendingIds : [...ascendingIds].reverse());
    }
  });

  it('keeps string filter semantics independent from name sorting', async () => {
    const { root, dataset, createCollection } = await createFixture();
    const tagId = '68ad85a7463006c963799a05';
    const upper = await createCollection('upper', { tags: [{ tagId, value: 'A' }] });
    await createCollection('lower', { tags: [{ tagId, value: 'a' }] });

    const request = (body: Record<string, unknown>) =>
      Call(listHandler, {
        auth: root,
        body: {
          datasetId: dataset._id,
          pageSize: 10,
          offset: 0,
          tagFilters: [{ tagId, values: ['A'] }],
          ...body
        }
      });

    // 名称排序不能改变标签的默认（大小写敏感）匹配语义，列表与 total 必须一致。
    for (const body of [
      { sortBy: 'name', sortOrder: 'asc' },
      { sortBy: 'name', simple: true }
    ]) {
      const response = await request(body);
      expect(response.code).toBe(200);
      expect(response.data.total).toBe(1);
      expect(response.data.list.map((item) => String(item._id))).toEqual([String(upper._id)]);
    }
  });

  it('keeps search filtering consistent with name sorting', async () => {
    const { root, dataset, createCollection } = await createFixture();
    await createCollection('alpha-file');
    await createCollection('beta-file');
    await createCollection('gamma-file');
    await createCollection('other');

    const response = await Call(listHandler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        searchText: 'file',
        sortBy: 'name',
        sortOrder: 'desc',
        pageSize: 10,
        offset: 0
      }
    });
    expect(response.code).toBe(200);
    expect(response.data.total).toBe(3);
    expect(response.data.list.map((item) => item.name)).toEqual([
      'gamma-file',
      'beta-file',
      'alpha-file'
    ]);
  });

  it('keeps collection permissions consistent with name sorting', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const dataset = await MongoDataset.create({
      name: 'sort-permission',
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      vectorModel: 'test',
      agentModel: 'test',
      collectionPermissionEnabled: true
    });
    const create = (name: string) =>
      MongoDatasetCollection.create({
        name,
        type: DatasetCollectionTypeEnum.file,
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        datasetId: dataset._id
      });
    const readable = await create('readable');
    await create('hidden');
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: users.owner.teamId,
        resourceId: dataset._id,
        tmbId: member.tmbId,
        permission: ReadPermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: users.owner.teamId,
        resourceId: readable._id,
        tmbId: member.tmbId,
        permission: ReadPermissionVal
      }
    ]);

    const response = await Call(listHandler, {
      auth: member,
      body: { datasetId: dataset._id, sortBy: 'name', pageSize: 10, offset: 0 }
    });
    expect(response.code).toBe(200);
    expect(response.data.total).toBe(1);
    expect(response.data.list.map((item) => String(item._id))).toEqual([String(readable._id)]);
  });

  it('rejects unsupported sortBy and sortOrder values', async () => {
    const { root, dataset } = await createFixture();

    for (const body of [{ sortBy: 'chunkSize' }, { sortBy: 'dataAmount' }, { sortOrder: 'up' }]) {
      const response = await Call(listHandler, {
        auth: root,
        body: { datasetId: dataset._id, ...body }
      });
      expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
    }
  });
});
