import { describe, expect, test, vi } from 'vitest';
import { createVectorDBTestSuite } from '../testSuites';

// Unmock vector controllers for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/opengauss');
vi.unmock('@fastgpt/service/common/vectorDB/constants');
// 测试真实建图和目录核验，用较小阈值限制测试夹具的构建成本。
vi.mock('@fastgpt/global/core/dataset/vectorData/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  DATASET_VECTOR_INDEX_MIN_ROWS: 10,
  DATASET_VECTOR_INDEX_DROP_ROWS: 5
}));

import { OpenGaussVectorCtrl } from '@fastgpt/service/common/vectorDB/opengauss';
import { OgClient } from '@fastgpt/service/common/vectorDB/opengauss/controller';
import {
  ensureOpenGaussDatasetIndex,
  removeOpenGaussDatasetIndex
} from '@fastgpt/service/common/vectorDB/opengauss/datasetIndex';
import { Types } from '@fastgpt/service/common/mongo';
import { QUERY_VECTOR } from '../testData';

const isEnabled = Boolean(process.env.OPENGAUSS_URL);

describe.skipIf(!isEnabled)('OpenGauss Vector Integration', () => {
  const vectorCtrl = new OpenGaussVectorCtrl();
  createVectorDBTestSuite(vectorCtrl);

  test('builds and reuses a dataset HNSW, then merges results with an exact dataset', async () => {
    const teamId = String(new Types.ObjectId());
    const datasetId = String(new Types.ObjectId());
    const exactId = String(new Types.ObjectId());
    const collectionId = String(new Types.ObjectId());
    const scope = { teamId, datasetId };
    const indexName = `modeldata_og_${datasetId}`;
    const rows = 64;
    await vectorCtrl.init();
    try {
      await OgClient.query(
        `INSERT INTO modeldata(vector,team_id,dataset_id,collection_id)
         SELECT ('[' || (0.25 + i / 100000.0) || ',' || repeat('0,', 1534) || '0]')::vector,
                $1, $2, $3 FROM generate_series(1, $4) AS i`,
        [teamId, datasetId, collectionId, rows]
      );
      const exact = await OgClient.query<{ id: string }>(
        'INSERT INTO modeldata(vector,team_id,dataset_id,collection_id) VALUES ($1::vector,$2,$3,$4) RETURNING id',
        [`[${QUERY_VECTOR.join(',')}]`, teamId, exactId, collectionId]
      );
      const callbacks = { onBuilding: async () => true };
      expect(await ensureOpenGaussDatasetIndex({ ...scope, ...callbacks })).toEqual({
        indexState: 'ready',
        created: true
      });
      expect(await ensureOpenGaussDatasetIndex({ ...scope, ...callbacks })).toEqual({
        indexState: 'ready',
        created: false
      });
      const { results } = await vectorCtrl.embRecall({
        teamId,
        datasetIds: [datasetId, exactId],
        datasetVectorData: [{ datasetId, rows, openGaussIndex: 'ready' }],
        vector: QUERY_VECTOR,
        limit: 3,
        hnswEfSearch: 128,
        forbidCollectionIdList: [],
        filterCollectionIdList: [collectionId]
      });
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(exact.rows[0].id);
    } finally {
      await removeOpenGaussDatasetIndex(scope);
      await vectorCtrl.delete({ teamId, datasetIds: [datasetId, exactId] });
    }
    const index = await OgClient.query('SELECT 1 FROM pg_indexes WHERE indexname = $1', [
      indexName
    ]);
    expect(index.rows).toEqual([]);
  }, 30000);
});
