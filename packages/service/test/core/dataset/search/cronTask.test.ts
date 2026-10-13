import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetVectorDataByTime = vi.hoisted(() => vi.fn());
const mockDeleteDatasetDataVector = vi.hoisted(() => vi.fn());
const mockCountDocuments = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({
  deleteDatasetDataVector: mockDeleteDatasetDataVector,
  getVectorDataByTime: mockGetVectorDataByTime
}));
vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  // DatasetDataCollectionName 被 training/schema 引用,需保留字符串常量
  DatasetDataCollectionName: 'dataset_datas',
  MongoDatasetData: { countDocuments: mockCountDocuments }
}));
vi.mock('@fastgpt/service/core/dataset/data/dataTextSchema', () => ({
  MongoDatasetDataText: {}
}));

import { checkInvalidVector } from '@/service/common/system/cronTask';

const VECTOR_ID = '1234567890123456';

beforeEach(() => {
  mockGetVectorDataByTime.mockReset().mockResolvedValue([]);
  mockDeleteDatasetDataVector.mockReset();
  mockCountDocuments.mockReset().mockResolvedValue(1);
});

describe('checkInvalidVector orphan cleanup', () => {
  it('TC-17.1 deletes orphan when vector id has no dataset_data', async () => {
    /*
     * 被测函数名: checkInvalidVector  等级: 3-High
     * 单测函数思路(异常场景-孤儿行):
     * modeldata_v2 行按向量 id 反查 MongoDatasetData('indexes.dataId' === 向量 id),
     * count=0 视为悬空行,期望: 调用 deleteDatasetDataVector({teamId, id}) 删除。
     */
    mockGetVectorDataByTime.mockResolvedValue([
      { id: VECTOR_ID, teamId: 'team-1', datasetId: 'dataset-1' }
    ]);
    mockCountDocuments.mockResolvedValue(0);

    await checkInvalidVector(new Date(0), new Date());

    expect(mockCountDocuments).toHaveBeenCalledWith({
      teamId: 'team-1',
      datasetId: 'dataset-1',
      'indexes.dataId': VECTOR_ID
    });
    expect(mockDeleteDatasetDataVector).toHaveBeenCalledWith({
      teamId: 'team-1',
      id: VECTOR_ID
    });
  });

  it('TC-17.2 keeps row when vector id exists', async () => {
    /*
     * 被测函数名: checkInvalidVector  等级: 3-High
     * 单测函数思路(正常场景-有效行):
     * modeldata_v2 行按向量 id 反查 MongoDatasetData count>0,
     * 期望: 不删除(deleteDatasetDataVector 不被调用)。
     */
    mockGetVectorDataByTime.mockResolvedValue([
      { id: VECTOR_ID, teamId: 'team-1', datasetId: 'dataset-1' }
    ]);
    mockCountDocuments.mockResolvedValue(1);

    await checkInvalidVector(new Date(0), new Date());

    expect(mockCountDocuments).toHaveBeenCalledWith({
      teamId: 'team-1',
      datasetId: 'dataset-1',
      'indexes.dataId': VECTOR_ID
    });
    expect(mockDeleteDatasetDataVector).not.toHaveBeenCalled();
  });
});
