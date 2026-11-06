import { describe, expect, test, vi } from 'vitest';
import { createVectorDBTestSuite } from '../testSuites';
import { createTestIds, TEST_VECTORS } from '../testData';

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
});
