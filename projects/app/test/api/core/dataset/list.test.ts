import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/dataset/list';
import handlerV2 from '@/pages/api/core/dataset/listV2';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import * as collectionEntity from '@fastgpt/service/core/dataset/collection/entity';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AppListSortEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import type {
  GetDatasetListBody,
  GetDatasetListResponse,
  GetDatasetListV2Body,
  GetDatasetListV2Response
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { Types } from '@fastgpt/service/common/mongo';

describe('POST /api/core/dataset/list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('组合类型和创建者筛选，并支持创建顺序与空选择', async () => {
    const owner = await getUser(`dataset-filter-owner-${getNanoid(6)}`);
    const member = await getUser(`dataset-filter-member-${getNanoid(6)}`, owner.teamId);

    const olderId = Types.ObjectId.createFromTime(1_700_000_000);
    const newerId = Types.ObjectId.createFromTime(1_800_000_000);
    const [olderDataset, newerDataset] = await MongoDataset.create([
      {
        _id: olderId,
        teamId: owner.teamId,
        tmbId: member.tmbId,
        name: 'Older website dataset',
        type: DatasetTypeEnum.websiteDataset,
        createTime: olderId.getTimestamp()
      },
      {
        _id: newerId,
        teamId: owner.teamId,
        tmbId: member.tmbId,
        name: 'Newer website dataset',
        type: DatasetTypeEnum.websiteDataset,
        createTime: newerId.getTimestamp()
      },
      {
        teamId: owner.teamId,
        tmbId: member.tmbId,
        name: 'Other type dataset',
        type: DatasetTypeEnum.dataset
      },
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'Owner website dataset',
        type: DatasetTypeEnum.websiteDataset
      }
    ]);

    const filtered = await Call<GetDatasetListBody, Record<string, never>, GetDatasetListResponse>(
      handler,
      {
        auth: owner,
        body: {
          parentId: null,
          type: [DatasetTypeEnum.folder, DatasetTypeEnum.websiteDataset],
          tmbIds: [String(member.tmbId)],
          sort: AppListSortEnum.createTimeAsc
        }
      }
    );
    expect(filtered.code).toBe(200);
    expect(filtered.data.map((item) => String(item._id))).toEqual([
      String(olderDataset._id),
      String(newerDataset._id)
    ]);
    expect(filtered.data.map((item) => item.createTime)).toEqual([
      olderId.getTimestamp(),
      newerId.getTimestamp()
    ]);

    const empty = await Call<GetDatasetListBody, Record<string, never>, GetDatasetListResponse>(
      handler,
      {
        auth: owner,
        body: { parentId: null, tmbIds: [] }
      }
    );
    expect(empty.data).toEqual([]);

    const filteredV2 = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: owner,
      body: {
        parentId: null,
        type: [DatasetTypeEnum.folder, DatasetTypeEnum.websiteDataset],
        tmbIds: [String(member.tmbId)],
        sort: AppListSortEnum.createTimeAsc
      }
    });
    expect(filteredV2.code).toBe(200);
    expect(filteredV2.data.total).toBe(2);
    expect(filteredV2.data.list.map((item) => String(item._id))).toEqual([
      String(olderDataset._id),
      String(newerDataset._id)
    ]);

    const emptyV2 = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: owner,
      body: { parentId: null, tmbIds: [] }
    });
    expect(emptyV2.data).toEqual({ list: [], total: 0 });
  });

  it('keeps the original array response', async () => {
    const user = await getUser(`dataset-list-${getNanoid(6)}`);
    const updateTimes = [
      new Date('2024-01-03T00:00:00.000Z'),
      new Date('2024-01-02T00:00:00.000Z'),
      new Date('2024-01-01T00:00:00.000Z')
    ];

    await MongoDataset.create(
      updateTimes.map((updateTime, index) => ({
        name: `Dataset ${index + 1}`,
        type: DatasetTypeEnum.dataset,
        teamId: user.teamId,
        tmbId: user.tmbId,
        updateTime
      }))
    );
    const res = await Call<GetDatasetListBody, Record<string, never>, GetDatasetListResponse>(
      handler,
      {
        auth: user,
        body: { type: DatasetTypeEnum.dataset }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data).toHaveLength(3);
    expect(res.data[0].name).toBe('Dataset 1');
  });

  it('returns a stable paginated result from V2', async () => {
    const user = await getUser(`dataset-list-v2-${getNanoid(6)}`);
    const datasets = await MongoDataset.create(
      [3, 2, 1].map((index) => ({
        name: `Dataset ${index}`,
        type: DatasetTypeEnum.dataset,
        teamId: user.teamId,
        tmbId: user.tmbId,
        updateTime: new Date(`2024-01-0${index}T00:00:00.000Z`)
      }))
    );
    await MongoDatasetCollection.create(
      datasets.flatMap((dataset, index) =>
        Array.from({ length: index + 1 }, (_, fileIndex) => ({
          name: `${dataset.name} file ${fileIndex}`,
          type: DatasetCollectionTypeEnum.file,
          teamId: user.teamId,
          tmbId: user.tmbId,
          datasetId: dataset._id
        }))
      )
    );
    const countSpy = vi.spyOn(collectionEntity, 'countDatasetCollectionsByDatasetIds');
    const res = await Call<GetDatasetListV2Body, Record<string, never>, GetDatasetListV2Response>(
      handlerV2,
      {
        auth: user,
        body: { type: DatasetTypeEnum.dataset, pageNum: 2, pageSize: 1, withFileCount: true }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(3);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].name).toBe('Dataset 2');
    expect(res.data.list[0].fileCount).toBe(2);
    expect(res.data.list[0]).not.toHaveProperty('appCount');
    expect(countSpy).toHaveBeenCalledExactlyOnceWith({
      teamId: String(user.teamId),
      datasetIds: [String(res.data.list[0]._id)]
    });
  });
  it('returns owner app counts when requested', async () => {
    const user = await getUser(`dataset-list-app-count-${getNanoid(6)}`);
    const dataset = await MongoDataset.create({
      name: 'Dataset without references',
      type: DatasetTypeEnum.dataset,
      teamId: user.teamId,
      tmbId: user.tmbId
    });

    const response = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: user,
      body: { type: DatasetTypeEnum.dataset, withAppCount: true }
    });
    expect(response.code).toBe(200);
    const countedDataset = response.data.list.find(
      (item) => String(item._id) === String(dataset._id)
    );
    expect(countedDataset).toMatchObject({ appCount: 0 });
  });
  it('omits folder counts and counts direct references for child datasets', async () => {
    const user = await getUser(`dataset-list-folder-count-${getNanoid(6)}`);
    const folderId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const appId = new Types.ObjectId();
    const publishedVersionId = new Types.ObjectId();

    await MongoDataset.create([
      {
        _id: folderId,
        name: 'Dataset folder',
        type: DatasetTypeEnum.folder,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: null
      },
      {
        _id: datasetId,
        name: 'Referenced dataset',
        type: DatasetTypeEnum.dataset,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: folderId
      }
    ]);
    await MongoApp.create({
      _id: appId,
      name: 'App referencing dataset',
      type: AppTypeEnum.workflow,
      teamId: user.teamId,
      tmbId: user.tmbId,
      parentId: null,
      publishedVersionId,
      deleteTime: null
    });
    await MongoAppVersion.collection.insertOne({
      _id: publishedVersionId,
      appId,
      tmbId: new Types.ObjectId(user.tmbId),
      time: new Date(),
      isPublish: true,
      resources: [{ type: 'dataset', id: String(datasetId) }]
    });

    const folderResponse = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: user,
      body: { parentId: null, withAppCount: true }
    });
    const folder = folderResponse.data.list.find((item) => String(item._id) === String(folderId));
    expect(folder).toBeDefined();
    expect(folder).not.toHaveProperty('appCount');

    const childResponse = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: user,
      body: { parentId: String(folderId), withAppCount: true }
    });
    expect(
      childResponse.data.list.find((item) => String(item._id) === String(datasetId))
    ).toMatchObject({ appCount: 1 });
  });
  it.each([undefined, false])(
    'skips file counting when withFileCount is %s',
    async (withFileCount) => {
      const user = await getUser(`dataset-list-without-file-count-${getNanoid(6)}`);
      await MongoDataset.create({
        name: 'Dataset without requested file count',
        type: DatasetTypeEnum.dataset,
        teamId: user.teamId,
        tmbId: user.tmbId
      });
      const countSpy = vi.spyOn(collectionEntity, 'countDatasetCollectionsByDatasetIds');

      const response = await Call<
        GetDatasetListV2Body,
        Record<string, never>,
        GetDatasetListV2Response
      >(handlerV2, {
        auth: user,
        body: { parentId: null, withFileCount, withAppCount: true }
      });

      expect(response.code).toBe(200);
      expect(response.data.list).toHaveLength(1);
      expect(response.data.list[0]).not.toHaveProperty('fileCount');
      expect(response.data.list[0].appCount).toBe(0);
      expect(countSpy).not.toHaveBeenCalled();
    }
  );

  it('returns non-folder file counts when requested and omits them for folders', async () => {
    const user = await getUser(`dataset-list-file-count-${getNanoid(6)}`);
    const parentFolderId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const rootDatasetId = new Types.ObjectId();
    const emptyDatasetId = new Types.ObjectId();
    const collectionFolderId = new Types.ObjectId();

    await MongoDataset.create([
      {
        _id: parentFolderId,
        name: 'Dataset folder',
        type: DatasetTypeEnum.folder,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: null
      },
      {
        _id: datasetId,
        name: 'Dataset inside folder',
        type: DatasetTypeEnum.dataset,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: parentFolderId
      },
      {
        _id: rootDatasetId,
        name: 'Root dataset with one file',
        type: DatasetTypeEnum.dataset,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: null
      },
      {
        _id: emptyDatasetId,
        name: 'Empty dataset',
        type: DatasetTypeEnum.dataset,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: null
      }
    ]);
    await MongoDatasetCollection.create([
      {
        _id: collectionFolderId,
        name: 'Inner folder',
        type: DatasetCollectionTypeEnum.folder,
        teamId: user.teamId,
        tmbId: user.tmbId,
        datasetId
      },
      {
        name: 'File in root',
        type: DatasetCollectionTypeEnum.file,
        teamId: user.teamId,
        tmbId: user.tmbId,
        datasetId
      },
      {
        name: 'Nested file',
        type: DatasetCollectionTypeEnum.file,
        teamId: user.teamId,
        tmbId: user.tmbId,
        datasetId,
        parentId: collectionFolderId
      },
      {
        name: 'Root dataset file',
        type: DatasetCollectionTypeEnum.file,
        teamId: user.teamId,
        tmbId: user.tmbId,
        datasetId: rootDatasetId
      }
    ]);

    const rootResponse = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: user,
      body: { parentId: null, withFileCount: true }
    });
    const findRow = (response: typeof rootResponse, id: Types.ObjectId) =>
      response.data.list.find((item) => String(item._id) === String(id));

    // folder 行不返回文件数
    expect(findRow(rootResponse, parentFolderId)).not.toHaveProperty('fileCount');
    expect(findRow(rootResponse, rootDatasetId)).toMatchObject({ fileCount: 1 });
    expect(findRow(rootResponse, emptyDatasetId)).toMatchObject({ fileCount: 0 });

    const childResponse = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: user,
      body: { parentId: String(parentFolderId), withFileCount: true }
    });
    // folder 内的文件也计入，folder 自身不计入
    expect(findRow(childResponse, datasetId)).toMatchObject({ fileCount: 2 });
  });

  it('omits dataset app counts for non-owners when requested', async () => {
    const { owner, members } = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'Shared dataset',
      type: DatasetTypeEnum.dataset,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: owner.teamId,
      resourceId: String(dataset._id),
      tmbId: members[0].tmbId,
      permission: ReadPermissionVal
    });

    const response = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: members[0],
      body: { type: DatasetTypeEnum.dataset }
    });
    const visibleDataset = response.data.list.find(
      (item) => String(item._id) === String(dataset._id)
    );

    expect(response.code).toBe(200);
    expect(visibleDataset).toBeDefined();
    expect(visibleDataset?.appCount).toBeUndefined();
  });

  it('lists navigable Dataset folders separately from readable empty folders', async () => {
    const { owner, members } = await getFakeUsers(1);
    const [rootFolder, nestedFolder, readableDataset, readableEmptyFolder, hiddenEmptyFolder] =
      await MongoDataset.create([
        { name: 'Root', type: DatasetTypeEnum.folder, teamId: owner.teamId, tmbId: owner.tmbId },
        { name: 'Nested', type: DatasetTypeEnum.folder, teamId: owner.teamId, tmbId: owner.tmbId },
        {
          name: 'Readable child',
          type: DatasetTypeEnum.dataset,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        },
        {
          name: 'Readable empty',
          type: DatasetTypeEnum.folder,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        },
        {
          name: 'Hidden empty',
          type: DatasetTypeEnum.folder,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        }
      ]);
    await MongoDataset.updateOne({ _id: nestedFolder._id }, { $set: { parentId: rootFolder._id } });
    await MongoDataset.updateOne(
      { _id: readableDataset._id },
      { $set: { parentId: nestedFolder._id } }
    );
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: owner.teamId,
        resourceId: readableDataset._id,
        tmbId: members[0].tmbId,
        permission: ReadPermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: owner.teamId,
        resourceId: readableEmptyFolder._id,
        tmbId: members[0].tmbId,
        permission: ReadPermissionVal
      }
    ]);

    const firstPage = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, { auth: members[0], body: { pageSize: 1 } });
    const secondPage = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, { auth: members[0], body: { pageNum: 2, pageSize: 1 } });
    const rootItems = [...firstPage.data.list, ...secondPage.data.list];
    expect(firstPage.data.total).toBe(2);
    expect(secondPage.data.total).toBe(2);
    expect(rootItems.map(({ _id }) => String(_id))).toContain(String(rootFolder._id));
    expect(rootItems.map(({ _id }) => String(_id))).toContain(String(readableEmptyFolder._id));
    expect(rootItems.map(({ _id }) => String(_id))).not.toContain(String(hiddenEmptyFolder._id));
    expect(
      rootItems.find(({ _id }) => String(_id) === String(rootFolder._id))?.folderAccessMode
    ).toBe('navigate');
    expect(
      rootItems.find(({ _id }) => String(_id) === String(readableEmptyFolder._id))?.folderAccessMode
    ).toBe('read');

    const emptyRootPage = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, { auth: members[0], body: { parentId: '' } });
    expect(emptyRootPage.data.total).toBe(2);
    expect(emptyRootPage.data.list.map(({ _id }) => String(_id))).toContain(String(rootFolder._id));

    const childPage = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, { auth: members[0], body: { parentId: String(rootFolder._id) } });
    expect(childPage.data.list).toMatchObject([
      { _id: String(nestedFolder._id), folderAccessMode: 'navigate' }
    ]);

    const searchPage = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: members[0],
      body: { parentId: String(rootFolder._id), searchKey: 'Readable child' }
    });
    expect(searchPage.data.total).toBe(1);
    expect(searchPage.data.list.map(({ _id }) => String(_id))).toEqual([
      String(readableDataset._id)
    ]);
    expect(searchPage.data.list[0]).not.toHaveProperty('folderAccessMode');

    const rootSearchPage = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handlerV2, {
      auth: members[0],
      body: { searchKey: 'Readable child' }
    });
    expect(rootSearchPage.data.total).toBe(1);
    expect(rootSearchPage.data.list.map(({ _id }) => String(_id))).toEqual([
      String(readableDataset._id)
    ]);
  });

  it('normalizes nullish avatar and intro from legacy records in V2', async () => {
    const user = await getUser(`dataset-list-v2-legacy-${getNanoid(6)}`);
    const dataset = await MongoDataset.create({
      name: 'Legacy Dataset',
      type: DatasetTypeEnum.dataset,
      teamId: user.teamId,
      tmbId: user.tmbId,
      updateTime: new Date('2024-01-01T00:00:00.000Z')
    });
    await MongoDataset.collection.updateOne(
      { _id: new Types.ObjectId(String(dataset._id)) },
      { $set: { avatar: null }, $unset: { intro: '' } }
    );

    const res = await Call<GetDatasetListV2Body, Record<string, never>, GetDatasetListV2Response>(
      handlerV2,
      {
        auth: user,
        body: { type: DatasetTypeEnum.dataset }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.list).toContainEqual(
      expect.objectContaining({ name: 'Legacy Dataset', avatar: '/icon/logo.svg', intro: '' })
    );
  });
});
