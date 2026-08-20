import handler from '@/pages/api/core/dataset/list';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  GetDatasetListBody,
  GetDatasetListResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('POST /api/core/dataset/list', () => {
  it('returns a stable paginated result for the current directory', async () => {
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
        body: {
          type: DatasetTypeEnum.dataset,
          pageNum: 2,
          pageSize: 1
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(3);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].name).toBe('Dataset 2');
  });
});
