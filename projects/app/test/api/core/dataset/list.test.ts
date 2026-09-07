import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/dataset/list';
import handlerV2 from '@/pages/api/core/dataset/listV2';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AppListSortEnum } from '@fastgpt/global/core/app/constants';
import type {
  GetDatasetListBody,
  GetDatasetListResponse,
  GetDatasetListV2Body,
  GetDatasetListV2Response
} from '@fastgpt/global/openapi/core/dataset/api';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { Types } from '@fastgpt/service/common/mongo';

describe('POST /api/core/dataset/list', () => {
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
    await MongoDataset.create(
      [3, 2, 1].map((index) => ({
        name: `Dataset ${index}`,
        type: DatasetTypeEnum.dataset,
        teamId: user.teamId,
        tmbId: user.tmbId,
        updateTime: new Date(`2024-01-0${index}T00:00:00.000Z`)
      }))
    );
    const res = await Call<GetDatasetListV2Body, Record<string, never>, GetDatasetListV2Response>(
      handlerV2,
      {
        auth: user,
        body: { type: DatasetTypeEnum.dataset, pageNum: 2, pageSize: 1 }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(3);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].name).toBe('Dataset 2');
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
      expect.objectContaining({ name: 'Legacy Dataset', avatar: '', intro: '' })
    );
  });
});
