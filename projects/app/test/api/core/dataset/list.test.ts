import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/dataset/list';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AppListSortEnum } from '@fastgpt/global/core/app/constants';
import type {
  GetDatasetListBody,
  GetDatasetListResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { getUser } from '@test/datas/users';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { Call } from '@test/utils/request';

describe('POST /api/core/dataset/list', () => {
  it('组合类型和创建者筛选，并支持创建顺序与空选择', async () => {
    const owner = await getUser(`dataset-filter-owner-${getNanoid(6)}`);
    const member = await getUser(`dataset-filter-member-${getNanoid(6)}`, owner.teamId);

    const [olderDataset, newerDataset] = await MongoDataset.create([
      {
        teamId: owner.teamId,
        tmbId: member.tmbId,
        name: 'Older website dataset',
        type: DatasetTypeEnum.websiteDataset
      },
      {
        teamId: owner.teamId,
        tmbId: member.tmbId,
        name: 'Newer website dataset',
        type: DatasetTypeEnum.websiteDataset
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

    const empty = await Call<GetDatasetListBody, Record<string, never>, GetDatasetListResponse>(
      handler,
      {
        auth: owner,
        body: { parentId: null, tmbIds: [] }
      }
    );
    expect(empty.data).toEqual([]);
  });
});
