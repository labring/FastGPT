import { describe, expect, test, vi } from 'vitest';
import { createVectorDBTestSuite } from '../testSuites';
import { createTestIds, QUERY_VECTOR, TEST_VECTORS } from '../testData';

// Unmock vector controllers for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/dxmt');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { DxmtVectorCtrl } from '@fastgpt/service/common/vectorDB/dxmt';

const isEnabled = Boolean(process.env.DXMT_URL);

describe.skipIf(!isEnabled)('DXMT Vector Integration', () => {
  const vectorCtrl = new DxmtVectorCtrl();
  createVectorDBTestSuite(vectorCtrl);

  // 共享用例未覆盖的两点：按团队隔离删除/刷新，以及 refreshCreateTime 让向量重新进入时间扫描窗口
  test('delete and refreshCreateTime never touch another team', async () => {
    const { datasetId } = createTestIds();
    const insert = (teamId: string) =>
      vectorCtrl.insert({ teamId, datasetId, collectionId: 'col_1', vectors: [TEST_VECTORS[0]] });
    const [{ insertIds: own }, { insertIds: other }] = await Promise.all([
      insert('test_team_a'),
      insert('test_team_b')
    ]);

    await vectorCtrl.delete({ teamId: 'test_team_a', idList: [...own, ...other] });
    expect(await vectorCtrl.getVectorCount({ teamId: 'test_team_a', datasetId })).toBe(0);
    expect(await vectorCtrl.getVectorCount({ teamId: 'test_team_b', datasetId })).toBe(1);

    const before = Date.now();
    await vectorCtrl.refreshCreateTime({ teamId: 'test_team_a', idList: other });
    const untouched = await vectorCtrl.getVectorDataByTime(
      new Date(before),
      new Date(Date.now() + 1000)
    );
    expect(untouched.map((item) => item.id)).not.toContain(other[0]);

    await vectorCtrl.refreshCreateTime({ teamId: 'test_team_b', idList: other });
    const refreshed = await vectorCtrl.getVectorDataByTime(
      new Date(before),
      new Date(Date.now() + 1000)
    );
    expect(refreshed.map((item) => item.id)).toContain(other[0]);

    await vectorCtrl.delete({ teamId: 'test_team_b', datasetIds: [datasetId] });
  });

  // 以下四个边界来自 #8292 的审查建议：共享用例每次只插入 3 条，覆盖不到这些情况。
  const scaled = (factor: number) => QUERY_VECTOR.map((value) => value * factor);

  test('recall returns more than ten hits, best first', async () => {
    const { teamId, datasetId } = createTestIds();
    // 同方向、不同长度：内积随长度递减，期望的顺序是确定的
    const vectors = Array.from({ length: 25 }, (_, i) => scaled(1 - i * 0.03));
    await vectorCtrl.insert({ teamId, datasetId, collectionId: 'col_1', vectors });

    const { results } = await vectorCtrl.embRecall({
      teamId,
      datasetIds: [datasetId],
      vector: QUERY_VECTOR,
      limit: 25,
      forbidCollectionIdList: []
    });
    expect(results).toHaveLength(25);
    const scores = results.map((item) => item.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    await vectorCtrl.delete({ teamId, datasetIds: [datasetId] });
  });

  test('time scan pages past one thousand records without gaps or repeats', async () => {
    const { teamId, datasetId } = createTestIds();
    const before = Date.now();
    const vectors = Array.from({ length: 1006 }, (_, i) => scaled(1 - (i % 50) * 0.01));
    const { insertIds } = await vectorCtrl.insert({
      teamId,
      datasetId,
      collectionId: 'col_1',
      vectors
    });
    expect(insertIds).toHaveLength(1006);

    const scanned = (
      await vectorCtrl.getVectorDataByTime(new Date(before), new Date(Date.now() + 1000))
    )
      .filter((item) => item.datasetId === datasetId)
      .map((item) => item.id);
    expect(scanned).toHaveLength(1006);
    expect(new Set(scanned).size).toBe(1006);
    expect(new Set(scanned)).toEqual(new Set(insertIds.map(String)));

    await vectorCtrl.delete({ teamId, datasetIds: [datasetId] });
  });

  test('a collection both allowed and forbidden is not recalled; an empty allow list recalls nothing', async () => {
    const { teamId, datasetId } = createTestIds();
    await vectorCtrl.insert({
      teamId,
      datasetId,
      collectionId: 'col_1',
      vectors: [TEST_VECTORS[0]]
    });
    await vectorCtrl.insert({
      teamId,
      datasetId,
      collectionId: 'col_2',
      vectors: [TEST_VECTORS[1]]
    });
    const recall = (
      filterCollectionIdList: string[] | undefined,
      forbidCollectionIdList: string[]
    ) =>
      vectorCtrl
        .embRecall({
          teamId,
          datasetIds: [datasetId],
          vector: QUERY_VECTOR,
          limit: 10,
          forbidCollectionIdList,
          filterCollectionIdList
        })
        .then(({ results }) => results.map((item) => item.collectionId).sort());

    expect(await recall(['col_1', 'col_2'], ['col_1'])).toEqual(['col_2']);
    expect(await recall(['col_1'], ['col_1'])).toEqual([]);
    expect(await recall([], [])).toEqual([]);
    expect(await recall(undefined, ['col_2'])).toEqual(['col_1']);

    await vectorCtrl.delete({ teamId, datasetIds: [datasetId] });
  });

  test('an empty delete condition deletes nothing', async () => {
    const { teamId, datasetId } = createTestIds();
    await vectorCtrl.insert({ teamId, datasetId, collectionId: 'col_1', vectors: TEST_VECTORS });

    await vectorCtrl.delete({ teamId, idList: [] });
    await vectorCtrl.delete({ teamId, datasetIds: [] });
    await vectorCtrl.delete({ teamId, datasetIds: [datasetId], collectionIds: [] });
    expect(await vectorCtrl.getVectorCount({ teamId, datasetId })).toBe(TEST_VECTORS.length);

    await vectorCtrl.delete({ teamId, datasetIds: [datasetId] });
    expect(await vectorCtrl.getVectorCount({ teamId, datasetId })).toBe(0);
  });
});
