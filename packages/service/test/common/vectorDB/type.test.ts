import { describe, expect, it } from 'vitest';
import type {
  FullTextStore,
  FullTextSearchProps,
  FullTextSearchItem
} from '@fastgpt/service/common/vectorDB/type';
import {
  InsertVectorControllerPropsSchema,
  GetVectorDataByTimeResponseSchema
} from '@fastgpt/service/common/vectorDB/type';

describe('vectorDB type schemas', () => {
  const baseInsert = {
    teamId: 'team1',
    datasetId: 'ds1',
    collectionId: 'col1',
    vectors: [[0.1, 0.2]]
  };

  it('TC-5.1 accepts optional texts on insert', () => {
    // 被测: InsertVectorControllerPropsSchema  等级: 3-High
    // (正常场景) texts 为可选字段:缺省时解析成功;提供时字段须被保留在结果中
    // (zod z.object 默认会 strip 未知键,故断言 data.texts 存在以验证字段被 schema 声明)。
    const bare = InsertVectorControllerPropsSchema.safeParse(baseInsert);
    expect(bare.success).toBe(true);

    const res = InsertVectorControllerPropsSchema.safeParse({
      ...baseInsert,
      texts: ['hello']
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.texts).toEqual(['hello']);
    }
  });

  it('TC-5.2 accepts getVectorDataByTime rows without dataId', () => {
    // 被测: GetVectorDataByTimeResponseSchema  等级: 3-High
    // (正常场景) 行对象仅含 id/teamId/datasetId,不含冗余 dataId 字段
    const res = GetVectorDataByTimeResponseSchema.safeParse([
      { id: '1', teamId: 't', datasetId: 'd' }
    ]);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data[0].id).toBe('1');
      expect(res.data[0].teamId).toBe('t');
    }
  });

  it('TC-5.3 FullTextStore type exposes search + write/delete (compile-time contract)', () => {
    // 被测: FullTextStore / FullTextSearchProps / FullTextSearchItem / FullTextWriteProps  等级: 3-High
    // (契约场景) FullTextStore 含 search 与写/删方法(milvus 实现为空,mongo 真实落库);
    // props/item 字段形状与下游 Task 6/7 的消费一致。
    const store: FullTextStore = {
      search: async () => [],
      write: async () => {},
      deleteByDataId: async () => {},
      deleteByDatasetIds: async () => {},
      deleteByCollectionIds: async () => {}
    };
    // 类型层面:FullTextStore 包含 search + 写/删方法
    const keys = Object.keys(store);
    expect(keys).toEqual([
      'search',
      'write',
      'deleteByDataId',
      'deleteByDatasetIds',
      'deleteByCollectionIds'
    ]);
    const searchProps: FullTextSearchProps = {
      teamId: 't',
      datasetIds: ['d'],
      query: 'q',
      limit: 10,
      forbidCollectionIdList: []
    };
    expect(searchProps.teamId).toBe('t');
    const item: FullTextSearchItem = { dataId: 'd', collectionId: 'c', score: 1 };
    expect(item.dataId).toBe('d');
  });
});
