import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/dataset/detail';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getUser } from '@test/datas/users';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { Call } from '@test/utils/request';
import type {
  GetDatasetDetailQuery,
  GetDatasetDetailResponse
} from '@fastgpt/global/openapi/core/dataset/api';

describe('GET /api/core/dataset/detail', () => {
  it.each([true, false])(
    'returns details without createTime (legacy missing=%s)',
    async (missing) => {
      const owner = await getUser(`dataset-detail-${getNanoid(6)}`);
      const dataset = await MongoDataset.create({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'Dataset detail',
        type: DatasetTypeEnum.dataset
      });
      if (missing) {
        // 绕过新建默认值，模拟尚未补齐创建时间的旧版本记录。
        await MongoDataset.collection.updateOne(
          { _id: dataset._id },
          { $unset: { createTime: '' } }
        );
        expect(await MongoDataset.findById(dataset._id).lean()).not.toHaveProperty('createTime');
      }

      const result = await Call<
        Record<string, never>,
        GetDatasetDetailQuery,
        GetDatasetDetailResponse
      >(handler, {
        auth: owner,
        query: { id: String(dataset._id) }
      });

      expect(result.code).toBe(200);
      expect(result.data).toMatchObject({ _id: String(dataset._id), name: 'Dataset detail' });
      expect(result.data).toHaveProperty('permission');
      expect(result.data).not.toHaveProperty('createTime');
    }
  );
});
