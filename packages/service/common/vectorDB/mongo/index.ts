import { Types, type Model } from 'mongoose';
import type { DatasetDataEmbedding } from '@fastgpt/global/core/dataset/data/embedding/type';
import type { VectorControllerType } from '../type';
import { MongoDatasetDataEmbedding } from './schema';
import { initEmbeddingMongo, MongoEmbeddingSearchIndexName } from './controller';
import { assertMongoEmbeddingVector } from './utils';

// 以完整预过滤命中的向量规模选择查询方式；阈值是初始策略，不依据返回条数建删索引。
const EXACT_SEARCH_MAX_ROWS = 10_000;

/** MongoDB 向量 provider：保留字符串向量 ID，使用 1536 维 dotProduct + INT8 标量索引。 */
export class MongoVectorCtrl implements VectorControllerType {
  constructor(private readonly model: Model<DatasetDataEmbedding> = MongoDatasetDataEmbedding) {}

  init = initEmbeddingMongo;

  insert: VectorControllerType['insert'] = async ({
    teamId,
    datasetId,
    collectionId,
    vectors,
    texts
  }) => {
    if (vectors.length === 0) return { insertIds: [] };
    vectors.forEach(assertMongoEmbeddingVector);
    if (texts && texts.length !== vectors.length)
      throw new Error('Embedding texts and vectors must have the same length');
    await this.init();
    const createTime = new Date();
    const documents = vectors.map((vector, i) => ({
      _id: new Types.ObjectId().toHexString(),
      teamId,
      datasetId,
      collectionId,
      vector,
      createTime,
      ...(texts && { text: texts[i] })
    }));
    await this.model.insertMany(documents);
    return { insertIds: documents.map(({ _id }) => _id) };
  };

  delete: VectorControllerType['delete'] = async (props) => {
    const { teamId } = props;
    const filter = (() => {
      if ('id' in props) return { teamId, _id: props.id };
      if ('idList' in props) return { teamId, _id: { $in: props.idList } };
      return {
        teamId,
        datasetId: { $in: props.datasetIds },
        ...(props.collectionIds !== undefined && { collectionId: { $in: props.collectionIds } })
      };
    })();
    await this.init();
    await this.model.deleteMany(filter);
  };

  refreshCreateTime: VectorControllerType['refreshCreateTime'] = async ({ teamId, idList }) => {
    if (idList.length === 0) return;
    await this.init();
    await this.model.updateMany(
      { teamId, _id: { $in: idList } },
      { $set: { createTime: new Date() } }
    );
  };

  /** 共用全局 HNSW，按完整过滤后的规模自动选择 ENN / ANN，再统一返回原始内积分数。 */
  embRecall: VectorControllerType['embRecall'] = async ({
    teamId,
    datasetIds,
    vector,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList
  }) => {
    if (datasetIds.length === 0 || limit <= 0) return { results: [] };
    if (
      filterCollectionIdList !== undefined &&
      filterCollectionIdList.every((id) => forbidCollectionIdList.includes(id))
    ) {
      return { results: [] };
    }
    assertMongoEmbeddingVector(vector);
    await this.init();

    // 计数与检索复用同一过滤条件，避免大知识库中的小可读集合被误判成大范围查询。
    const filter = {
      teamId,
      datasetId: { $in: datasetIds },
      ...((forbidCollectionIdList.length > 0 || filterCollectionIdList !== undefined) && {
        collectionId: {
          ...(filterCollectionIdList !== undefined && { $in: filterCollectionIdList }),
          ...(forbidCollectionIdList.length > 0 && { $nin: forbidCollectionIdList })
        }
      })
    };
    // 只需区分是否超过阈值，不为大范围查询统计全部匹配行；计数不代替权限过滤。
    const rows = await this.model.countDocuments(filter).limit(EXACT_SEARCH_MAX_ROWS + 1);
    if (rows === 0) return { results: [] };

    // 正常业务 limit <= 100；超出 ANN 候选上限的内部调用仍保留精确检索兼容行为。
    const exact = rows <= EXACT_SEARCH_MAX_ROWS || limit > 10_000;
    const recallLimit = exact ? limit : Math.min(10_000, limit * 2);
    const results = await this.model.aggregate<{
      _id: string;
      collectionId: string;
      score: number;
    }>([
      {
        $vectorSearch: {
          index: MongoEmbeddingSearchIndexName,
          path: 'vector',
          queryVector: vector,
          ...(exact
            ? { exact: true }
            : { numCandidates: Math.min(10_000, Math.max(100, recallLimit * 20)) }),
          // ANN 扩大候选后使用源向量精排；ENN 已按原始精度检索，无需扩大候选。
          limit: recallLimit,
          filter
        }
      },
      {
        $project: {
          _id: 1,
          collectionId: 1,
          score: {
            $sum: {
              $map: {
                input: { $zip: { inputs: ['$vector', { $literal: vector }] } },
                as: 'pair',
                in: {
                  $multiply: [{ $arrayElemAt: ['$$pair', 0] }, { $arrayElemAt: ['$$pair', 1] }]
                }
              }
            }
          }
        }
      },
      { $sort: { score: -1, _id: 1 } },
      { $limit: limit }
    ]);
    return {
      // 直接返回原始向量内积，不将 INT8 的近似分数用于相似度阈值判断。
      results: results.map(({ _id, collectionId, score }) => ({
        id: _id,
        collectionId,
        score
      }))
    };
  };

  getVectorDataByTime: VectorControllerType['getVectorDataByTime'] = async (start, end) => {
    await this.init();
    const rows = await this.model
      .find({ createTime: { $gte: start, $lte: end } })
      .select('_id teamId datasetId')
      .lean();
    return rows.map(({ _id, teamId, datasetId }) => ({ id: _id, teamId, datasetId }));
  };

  getVectorCount: VectorControllerType['getVectorCount'] = async (props) => {
    await this.init();
    return this.model.countDocuments({
      ...(props.teamId !== undefined && { teamId: props.teamId }),
      ...(props.datasetId !== undefined && { datasetId: props.datasetId }),
      ...(props.collectionId !== undefined && { collectionId: props.collectionId })
    });
  };
}
