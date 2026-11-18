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
import { UserError } from '@fastgpt/global/common/error/utils';
import { searchSqlFullText } from '../fullText/sql/store';
import { isSqlFullTextTargetReady } from '../fullText/sql/readiness';
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
 * SQL 向量库的兼容模式固定读写旧 Mongo 全文，原生模式仅在已验收目标就绪后读 SQL。
 */
export class SqlFullTextStore extends MongoFullTextStore {
  override async search(props: FullTextSearchProps): Promise<FullTextSearchItem[]> {
    if (getFullTextProvider() === 'mongo') return super.search(props);
    if (props.limit <= 0 || !props.query.trim() || !props.datasetIds.length) return [];
    if (!isSqlFullTextTargetReady()) {
      throw new UserError(
        'SQL full-text search is not ready. Complete the SQL full-text migration.'
      );
    }
    return searchSqlFullText(props);
  }

  /** 兼容模式维护旧 Mongo 全文，SQL 词串始终由向量写入通道同行保存。 */
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

/** 按物理存储分发单例，SQL Store 统一处理兼容模式和迁移就绪状态。 */
export const getFullTextStore = (): FullTextStore => {
  if (fullTextStore) return fullTextStore;
  fullTextStore = getVectorType() === 'milvus' ? getMilvusFullTextStore() : new SqlFullTextStore();
  return fullTextStore;
};
