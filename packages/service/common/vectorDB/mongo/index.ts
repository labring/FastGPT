import { Types, type Model } from 'mongoose';
import type { DatasetDataEmbedding } from '@fastgpt/global/core/dataset/data/embedding/type';
import type { VectorControllerType } from '../type';
import { MongoDatasetDataEmbedding } from './schema';
import { initEmbeddingMongo, MongoEmbeddingSearchIndexName } from './controller';
import { assertMongoEmbeddingVector } from './utils';

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
          // MongoDB 上限 10000；请求大结果集时使用精确检索，避免无效 numCandidates。
          ...(limit > 10000
            ? { exact: true }
            : { numCandidates: Math.min(10000, Math.max(100, limit * 20)) }),
          // 量化分数会有截断误差，扩大候选后用源向量精排，保持业务内积阈值稳定。
          limit: limit > 10000 ? limit : Math.min(10000, limit * 2),
          filter: {
            teamId,
            datasetId: { $in: datasetIds },
            ...((forbidCollectionIdList.length > 0 || filterCollectionIdList !== undefined) && {
              collectionId: {
                ...(filterCollectionIdList !== undefined && { $in: filterCollectionIdList }),
                ...(forbidCollectionIdList.length > 0 && { $nin: forbidCollectionIdList })
              }
            })
          }
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
