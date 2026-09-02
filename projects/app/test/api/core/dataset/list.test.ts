import handler from '@/pages/api/core/dataset/list';
import handlerV2 from '@/pages/api/core/dataset/listV2';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  GetDatasetListBody,
  GetDatasetListResponse,
  GetDatasetListV2Body,
  GetDatasetListV2Response
} from '@fastgpt/global/openapi/core/dataset/api';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('POST /api/core/dataset/list', () => {
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
      { _id: dataset._id },
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
