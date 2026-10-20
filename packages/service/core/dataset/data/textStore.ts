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
import { MongoDatasetDataText } from './dataTextSchema';

// re-export 共享类型(定义在 vectorDB/type.ts)
export type {
  FullTextStore,
  FullTextSearchProps,
  FullTextSearchItem
} from '../../../common/vectorDB/type';

/**
 * Mongo 全文实现。
 * 检索走 $text + jieba(基于现有 MongoDatasetDataText);写/删方法接收可选 session,
 * data 层事务内与主数据一并提交,批删/批量写同样透传 session 保持原子性。
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
   * 批量写入全文 token,按 dataId bulkWrite upsert(幂等,重复写安全)。
   * 支持事务内传 session,与主数据一并提交；skipUnchanged 仅在事务内比较实际已存 token。
   */
  async write(props: FullTextWriteProps[], session?: ClientSession): Promise<void> {
    const tokenized = await Promise.all(
      props.map(async (item) => ({
        teamId: item.teamId,
        datasetId: item.datasetId,
        collectionId: item.collectionId,
        dataId: item.dataId,
        fullTextToken: await jiebaSplit({ text: item.fullText }),
        skipUnchanged: item.skipUnchanged ?? false
      }))
    );

    for (let i = 0; i < tokenized.length; i += FULL_TEXT_WRITE_BATCH_SIZE) {
      const chunk = tokenized.slice(i, i + FULL_TEXT_WRITE_BATCH_SIZE);
      const comparisonItems =
        chunk.some((item) => item.skipUnchanged) && session?.inTransaction()
          ? chunk.filter((item) => item.skipUnchanged)
          : [];
      const existingRows = comparisonItems.length
        ? await MongoDatasetDataText.find(
            // 只按 dataId 点查（命中 dataId hashed 索引）；$or 多字段组合会诱导
            // 查询计划选到 teamId+datasetId+collectionId 索引并扫描整个集合的全文记录。
            // 租户/知识库/集合归属仍由下方内存比对判定。
            { dataId: { $in: comparisonItems.map((item) => item.dataId) } },
            'dataId teamId datasetId collectionId fullTextToken'
          )
            .session(session ?? null)
            .lean()
        : [];
      const existingById = new Map(existingRows.map((row) => [String(row.dataId), row]));
      const changedItems = chunk.filter((item) => {
        const existing = existingById.get(item.dataId);
        return (
          !item.skipUnchanged ||
          !existing ||
          String(existing.teamId) !== item.teamId ||
          String(existing.datasetId) !== item.datasetId ||
          String(existing.collectionId) !== item.collectionId ||
          existing.fullTextToken !== item.fullTextToken
        );
      });
      if (changedItems.length === 0) continue;

      await MongoDatasetDataText.bulkWrite(
        changedItems.map(({ skipUnchanged, ...item }) => ({
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
    // 逐 datasetId 删除,控制单查询规模并设置超时(与 delDatasetRelevantData 一致)
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

let fullTextStore: FullTextStore | undefined;

/** 全文检索实现跟随实际向量库 provider:milvus → BM25;其他向量库 → Mongo $text */
export const getFullTextStore = (): FullTextStore => {
  if (fullTextStore) return fullTextStore;
  fullTextStore =
    getVectorType() === 'milvus' ? getMilvusFullTextStore() : new MongoFullTextStore();
  return fullTextStore;
};
