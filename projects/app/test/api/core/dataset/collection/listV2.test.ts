import listHandler from '@/pages/api/core/dataset/collection/listV2';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
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

  it('does not match navigation-only or unreadable folders in the ready status filter', async () => {
    const { member, dataset, folder, file } = await setup();
    const params = {
      datasetId: dataset._id,
      pageSize: 10,
      offset: 0,
      statusFilter: { status: CollectionTrainingStatusEnum.ready }
    };

    const root = await Call(listHandler, { auth: member, body: params });
    expect(root.code).toBe(200);
    expect(root.data).toEqual({ total: 0, list: [] });

    const child = await Call(listHandler, {
      auth: member,
      body: { ...params, parentId: String(folder._id) }
    });
    expect(child.code).toBe(200);
    expect(child.data).toMatchObject({ total: 1, list: [{ _id: String(file._id) }] });
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

  it('filters processing mode and displayed training status before paginating', async () => {
    const { root, dataset, createCollection } = await createFixture();
    const chunk = await createCollection('a-chunk', {
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });
    const qa = await createCollection('b-qa', {
      trainingType: DatasetCollectionDataProcessModeEnum.qa
    });
    const ready = await createCollection('c-qa-ready', {
      trainingType: DatasetCollectionDataProcessModeEnum.qa
    });
    const scope = { teamId: root.teamId, tmbId: root.tmbId, datasetId: dataset._id };
    // 让非就绪文件排在首批 500 个候选之后，验证游标会继续筛选并累计总数。
    await MongoDatasetCollection.insertMany(
      Array.from({ length: 500 }, (_, index) => ({
        ...scope,
        name: `0-ready-${index}`,
        type: DatasetCollectionTypeEnum.file
      }))
    );
    await MongoDatasetTraining.create({
      ...scope,
      collectionId: chunk._id,
      mode: TrainingModeEnum.parse,
      billId: 'test',
      retryCount: 1
    });
    await MongoDatasetData.create({
      ...scope,
      collectionId: qa._id,
      q: 'saved content',
      indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed
    });

    const query = async (filters: Record<string, unknown>) => {
      const response = await Call(listHandler, {
        auth: root,
        body: { datasetId: dataset._id, pageSize: 1, offset: 0, sortBy: 'name', ...filters }
      });
      expect(response.code).toBe(200);
      return response.data;
    };

    const qaMode = { trainingType: DatasetCollectionDataProcessModeEnum.qa, sortOrder: 'asc' };
    expect(await query(qaMode)).toMatchObject({ total: 2, list: [{ _id: String(qa._id) }] });
    expect(await query({ ...qaMode, offset: 1 })).toMatchObject({
      total: 2,
      list: [{ _id: String(ready._id) }]
    });
    expect(
      await query({ statusFilter: { status: CollectionTrainingStatusEnum.ready } })
    ).toMatchObject({ total: 501, list: [{ _id: String(ready._id) }] });
    expect(
      await query({
        sortOrder: 'asc',
        statusFilter: { status: CollectionTrainingStatusEnum.error }
      })
    ).toMatchObject({
      total: 1,
      list: [{ _id: String(qa._id), slowestTrainingStatus: CollectionTrainingStatusEnum.error }]
    });
    const running = { status: CollectionTrainingStatusEnum.running };
    expect(
      await query({ statusFilter: { ...running, modes: [TrainingModeEnum.parse] } })
    ).toMatchObject({
      total: 1,
      list: [{ _id: String(chunk._id), slowestTrainingMode: TrainingModeEnum.parse }]
    });
    expect(await query({ statusFilter: { ...running, modes: [TrainingModeEnum.index] } })).toEqual({
      total: 0,
      list: []
    });
  });

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
