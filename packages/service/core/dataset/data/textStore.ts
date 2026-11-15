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
import {
  getFullTextProvider,
  shouldWriteMongoFullText
} from '../../../common/vectorDB/fullText/config';

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
 * 默认读 Mongo；管理员显式指定当前 SQL provider 且目标已通过验收时才读原生全文。
 * 双写开启时允许就绪失效后回退 Mongo；关闭双写后不能回退到已停止追平的旧全文。
 */
export class SqlFullTextStore extends MongoFullTextStore {
  override async search(props: FullTextSearchProps): Promise<FullTextSearchItem[]> {
    if (getFullTextProvider() === 'mongo') return super.search(props);
    if (await isSqlFullTextTargetReady()) {
      return searchSqlFullText(props);
    }
    if (!shouldWriteMongoFullText()) {
      throw new Error(
        'SQL full-text target is not ready and Mongo full-text dual write is disabled'
      );
    }
    return super.search(props);
  }

  /** Mongo 主读始终写入；原生读可关闭兼容写入，向量通道的同行词串写入不受影响。 */
  override async write(props: FullTextWriteProps[], session?: ClientSession): Promise<void> {
    if (shouldWriteMongoFullText()) await super.write(props, session);
  }

  /** 兼容写删使用同一开关，开启时透传上层事务。 */
  override async deleteByDataId(dataId: string, session?: ClientSession): Promise<void> {
    if (shouldWriteMongoFullText()) await super.deleteByDataId(dataId, session);
  }

  override async deleteByDatasetIds(
    props: { teamId: string; datasetIds: string[] },
    session?: ClientSession
  ): Promise<void> {
    if (shouldWriteMongoFullText()) await super.deleteByDatasetIds(props, session);
  }

  override async deleteByCollectionIds(
    props: { teamId: string; datasetIds: string[]; collectionIds: string[] },
    session?: ClientSession
  ): Promise<void> {
    if (shouldWriteMongoFullText()) await super.deleteByCollectionIds(props, session);
  }
}

let fullTextStore: FullTextStore | undefined;

/** 先核验显式读取 provider 与向量库匹配，再按物理存储分发单例；SQL 内部处理手动读路由。 */
export const getFullTextStore = (): FullTextStore => {
  if (fullTextStore) return fullTextStore;
  getFullTextProvider();
  fullTextStore = getVectorType() === 'milvus' ? getMilvusFullTextStore() : new SqlFullTextStore();
  return fullTextStore;
};
