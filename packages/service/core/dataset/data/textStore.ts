import { Types, type ClientSession } from '../../../common/mongo';
import { readFromSecondary } from '../../../common/mongo/utils';
import { jiebaSplit } from '../../../common/string/jieba/index';
import { getVectorType, FULL_TEXT_WRITE_BATCH_SIZE } from '../../../common/vectorDB/constants';
import type {
  FullTextStore,
  FullTextSearchProps,
  FullTextSearchItem,
  FullTextWriteProps
} from '../../../common/vectorDB/type';
import { getMilvusFullTextStore } from '../../../common/vectorDB/milvus/fullText';
import { isSqlFullTextTargetReady, searchSqlFullText } from '../fullText/sql/store';
import { MongoDatasetDataText } from './dataTextSchema';

export type {
  FullTextStore,
  FullTextSearchProps,
  FullTextSearchItem
} from '../../../common/vectorDB/type';

/**
 * Mongo 全文实现。
 * 检索走 $text + jieba（基于 MongoDatasetDataText）；写/删方法接收可选 session，
 * 在兼容窗口内保持与主数据同事务维护，供未完成回填验收或滚动升级期间兼容读取。
 */
export class MongoFullTextStore implements FullTextStore {
  async search({
    teamId,
    datasetIds,
    query,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList
  }: FullTextSearchProps): Promise<FullTextSearchItem[]> {
    if (!query || limit === 0 || datasetIds.length === 0) return [];

    const rows = (await MongoDatasetDataText.aggregate(
      [
        {
          $match: {
            teamId: new Types.ObjectId(teamId),
            $text: { $search: await jiebaSplit({ text: query }) },
            datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) },
            ...(filterCollectionIdList
              ? {
                  collectionId: {
                    $in: filterCollectionIdList
                      .filter((id) => !forbidCollectionIdList.includes(id))
                      .map((id) => new Types.ObjectId(id))
                  }
                }
              : forbidCollectionIdList?.length
                ? {
                    collectionId: {
                      $nin: forbidCollectionIdList.map((id) => new Types.ObjectId(id))
                    }
                  }
                : {})
          }
        },
        { $sort: { score: { $meta: 'textScore' } } },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            collectionId: 1,
            dataId: 1,
            score: { $meta: 'textScore' }
          }
        }
      ],
      { ...readFromSecondary }
    )) as { dataId: unknown; collectionId: unknown; score: number }[];

    return rows.map((item) => ({
      dataId: String(item.dataId),
      collectionId: String(item.collectionId),
      score: item.score || 0
    }));
  }

  /**
   * 批量写入全文 token，按 dataId bulkWrite upsert（幂等，重复写安全）。
   * 支持事务内传 session，与主数据一并提交。
   */
  async write(props: FullTextWriteProps[], session?: ClientSession): Promise<void> {
    const tokenized = await Promise.all(
      props.map(async (item) => ({
        teamId: item.teamId,
        datasetId: item.datasetId,
        collectionId: item.collectionId,
        dataId: item.dataId,
        fullTextToken: await jiebaSplit({ text: item.fullText })
      }))
    );

    for (let i = 0; i < tokenized.length; i += FULL_TEXT_WRITE_BATCH_SIZE) {
      const chunk = tokenized.slice(i, i + FULL_TEXT_WRITE_BATCH_SIZE);
      await MongoDatasetDataText.bulkWrite(
        chunk.map((item) => ({
          updateOne: {
            filter: { dataId: item.dataId },
            update: { $set: item },
            upsert: true
          }
        })),
        { ordered: false, session }
      );
    }
  }

  async deleteByDataId(dataId: string, session?: ClientSession): Promise<void> {
    await MongoDatasetDataText.deleteMany({ dataId }, { session });
  }

  async deleteByDatasetIds(
    { teamId, datasetIds }: { teamId: string; datasetIds: string[] },
    session?: ClientSession
  ): Promise<void> {
    for (const datasetId of datasetIds) {
      await MongoDatasetDataText.deleteMany({ teamId, datasetId }, { session }).maxTimeMS(300000);
    }
  }

  async deleteByCollectionIds(
    {
      teamId,
      datasetIds,
      collectionIds
    }: { teamId: string; datasetIds: string[]; collectionIds: string[] },
    session?: ClientSession
  ): Promise<void> {
    await MongoDatasetDataText.deleteMany(
      {
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      },
      { session }
    );
  }
}

/**
 * SQL 向量库（PG / OceanBase / SeekDB / openGauss）平滑切换全文实现。
 * 兼容窗口内继续继承维护 MongoDatasetDataText；仅当当前 SQL 物理目标已完成回填与验收时走原生 SQL 检索，
 * 未完成迁移、预检/验收失败或目标变更时自动回退到 Mongo $text 兼容读取。
 */
export class SqlFullTextStore extends MongoFullTextStore {
  override async search(props: FullTextSearchProps): Promise<FullTextSearchItem[]> {
    if (await isSqlFullTextTargetReady()) {
      return searchSqlFullText(props);
    }
    return super.search(props);
  }
}

let fullTextStore: FullTextStore | undefined;

/** 单例按配置的检索库分发：Milvus 走 BM25，SQL 向量库走带就绪屏障的 SqlFullTextStore。 */
export const getFullTextStore = (): FullTextStore => {
  if (fullTextStore) return fullTextStore;
  fullTextStore = getVectorType() === 'milvus' ? getMilvusFullTextStore() : new SqlFullTextStore();
  return fullTextStore;
};
