import { getVectorType } from '../../../common/vectorDB/constants';
import type {
  FullTextStore,
  FullTextSearchProps,
  FullTextSearchItem
} from '../../../common/vectorDB/type';
import { getMilvusFullTextStore } from '../../../common/vectorDB/milvus/fullText';
import { searchSqlFullText } from '../fullText/sql/store';

/**
 * SQL 向量库（PG / OceanBase / SeekDB / openGauss）原生全文实现。
 * 写入与删除已随向量行同表承载，此处仅负责查询召回与业务 ID 归一化。
 */
export class SqlFullTextStore implements FullTextStore {
  search(props: FullTextSearchProps): Promise<FullTextSearchItem[]> {
    return searchSqlFullText(props);
  }
}

let fullTextStore: FullTextStore | undefined;

/** 单例按配置的检索库分发：Milvus 走 BM25，SQL 向量库统一走各自原生全文检索。 */
export const getFullTextStore = (): FullTextStore => {
  if (fullTextStore) return fullTextStore;
  fullTextStore = getVectorType() === 'milvus' ? getMilvusFullTextStore() : new SqlFullTextStore();
  return fullTextStore;
};
