import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';
import type {
  UpdateDatasetDataPropsType,
  DatasetDataItemType,
  CreateDatasetDataPropsType
} from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { isS3ObjectKey, removeS3TTL } from '@fastgpt/service/common/s3/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import {
  datasetDataSystemIndexTypes,
  isDatasetDataSystemIndexType
} from '@fastgpt/global/core/dataset/data/utils';
import {
  DatasetDataIndexOperation,
  type DatasetDataIndexDraft
} from '@/service/core/dataset/data/dataIndex';

type UpdateDatasetDataByIndexesProps = Omit<UpdateDatasetDataPropsType, 'indexes'> & {
  indexes: NonNullable<UpdateDatasetDataPropsType['indexes']>;
  model: string;
  indexSize?: number;
  imageIndex?: boolean;
};

type UpdateDatasetDataSystemIndexesProps = Omit<
  UpdateDatasetDataByIndexesProps,
  'indexes' | 'q'
> & {
  q?: string;
  imageIndex?: boolean;
  indexes?: DatasetDataIndexDraft[];
};

/*
  数据进入 data/dataIndex 层时，VLM 图片描述索引已经由训练链路提前处理。
  这里只负责根据 data 当前内容生成系统索引，并保留外部传入的 question/summary/image/custom 索引。

  数据的几种情况：

  1. 普通文本数据：有 q/a
    - q/a 拆成 default 文本索引。
    - 如果 collection 开启 imageIndex 且 embedding model 支持多模态：
      q/a 里的 markdown 图片链接会生成 imageEmbedding 图片向量索引。

  2. 纯图片数据：有 imageId，q 可以没有
    - 如果 embedding model 支持多模态：用 imageId 生成 imageEmbedding 图片向量索引。
    - 如果上游 VLM 已经生成 q，q 会继续生成 default 文本索引。
*/

/**
 * 数据条目的写操作入口。
 *
 * 这个类负责协调一条 dataset data 相关的多份存储：
 * - MongoDatasetData：主数据、Q/A、indexes、历史记录
 * - MongoDatasetDataText：全文检索 token
 * - 向量库：每个 index 对应的向量记录
 * - S3：图片数据的生命周期或删除
 *
 * 修改这些流程时要特别注意写入顺序，避免 Mongo 中的 index dataId 和向量库记录不一致。
 */
export class DatasetDataOperation {
  private readonly indexOperation: DatasetDataIndexOperation;

  constructor(model?: string) {
    this.indexOperation = new DatasetDataIndexOperation(model);
  }

  /**
   * 通知 collection 重新计算统计信息和更新时间。
   * data/index/vector 任一写操作完成后都应触发一次。
   */
  private pushCollectionUpdate({
    collectionId,
    datasetId,
    teamId
  }: {
    collectionId: string;
    datasetId: string;
    teamId: string;
  }) {
    pushCollectionUpdateJob({
      collectionId: String(collectionId),
      datasetId: String(datasetId),
      teamId: String(teamId)
    });
  }

  /**
   * 创建一条 dataset data。
   *
   * 流程顺序：
   * 1. 根据 Q/A 和传入 indexes 生成最终索引列表
   * 2. 先写入向量库，拿到每条索引对应的 dataId
   * 3. 写入主数据和全文检索 token
   * 4. 如果图片来自 dataset S3 临时区，移除 TTL，避免被清理
   */
  async create({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    q,
    a,
    imageId,
    chunkIndex = 0,
    indexSize = 512,
    indexes,
    indexPrefix,
    embeddingModel,
    imageIndex,
    imageDescMap,
    session
  }: CreateDatasetDataPropsType & {
    embeddingModel: string;
    indexSize?: number;
    imageIndex?: boolean;
    imageDescMap?: Record<string, string>;
    session?: ClientSession;
  }) {
    // 纯图片数据允许没有正文；indexQ 保持为空，避免生成普通 default 文本向量索引。
    const dataQ = q || '';
    const indexQ = q || '';

    if ((!dataQ && !imageId) || !datasetId || !collectionId || !embeddingModel) {
      return Promise.reject('q, datasetId, collectionId, embeddingModel is required');
    }

    const embModel = getEmbeddingModel(embeddingModel)!;
    indexSize = Math.min(embModel.maxToken, indexSize);

    // 系统索引和外部索引在这里统一规范化，确保后续向量写入的输入已去重、切分。
    const newIndexes = await this.indexOperation.formatIndexes({
      indexes,
      q: indexQ,
      a,
      imageId,
      imageIndex,
      indexSize,
      maxIndexSize: embModel.maxToken,
      indexPrefix
    });

    const { tokens, indexes: results } = await this.indexOperation.insertVectors({
      indexes: newIndexes,
      teamId,
      datasetId,
      collectionId
    });

    // 主数据保存的是带 dataId 的 indexes，因此需要先完成向量写入。
    const [{ _id }] = await MongoDatasetData.create(
      [
        {
          teamId,
          tmbId,
          datasetId,
          collectionId,
          q: dataQ,
          a,
          imageId,
          imageDescMap,
          chunkIndex,
          indexes: results
        }
      ],
      { session, ordered: true }
    );

    // 单独维护分词后的全文检索内容，避免查询时临时分词。
    await MongoDatasetDataText.create(
      [
        {
          teamId,
          datasetId,
          collectionId,
          dataId: _id,
          fullTextToken: await jiebaSplit({ text: `${indexQ}\n${a}`.trim() })
        }
      ],
      { session, ordered: true }
    );

    // 图片在创建成功后从临时对象转为正式引用，不再允许 TTL 自动删除。
    if (isS3ObjectKey(imageId, 'dataset')) {
      await removeS3TTL({ key: imageId, bucketName: 'private', session });
    }

    this.pushCollectionUpdate({
      collectionId,
      datasetId,
      teamId
    });

    return {
      insertId: _id,
      tokens
    };
  }

  /**
   * 按调用方传入的完整 indexes 更新数据。
   *
   * 这个路径用于“手动指定全部索引”的更新：调用方给出的 indexes 会和系统索引
   * 一起格式化后与当前 indexes 做 diff，新增/变更的索引重建向量，删除的索引清理旧向量。
   */
  async updateByIndexes({
    dataId,
    q,
    a,
    imageId,
    indexes,
    model,
    indexSize = 512,
    indexPrefix,
    imageIndex
  }: UpdateDatasetDataByIndexesProps) {
    const embModel = getEmbeddingModel(model);

    if (!embModel) {
      return Promise.reject('Embedding model not found');
    }
    if (!Array.isArray(indexes)) {
      return Promise.reject('indexes is required');
    }

    const mongoData = await MongoDatasetData.findById(dataId);
    if (!mongoData) return Promise.reject('Data not found');

    // 获取新的索引组合
    const nextQ = q ?? mongoData.q ?? '';
    const nextA = a ?? mongoData.a ?? '';
    const nextImageId = imageId ?? mongoData.imageId;
    const formatIndexesResult = await this.indexOperation.formatIndexes({
      indexes,
      q: nextQ,
      a: nextA,
      imageId: nextImageId,
      imageIndex,
      indexSize,
      maxIndexSize: embModel.maxToken,
      indexPrefix
    });

    // 把旧的 dataId 加到新的索引里
    const indexesWithExistingSystemIds = this.indexOperation.mergeExistingSystemIndexIds({
      currentIndexes: mongoData.indexes,
      nextSystemIndexes: formatIndexesResult
    });

    // patchResult 先保留旧 dataId；insertVectorForPatch 会为 create/update 项写入新向量并回填新 dataId。
    const patchResult = this.indexOperation.buildPatch({
      currentIndexes: mongoData.indexes,
      nextIndexes: indexesWithExistingSystemIds
    });

    // 提前刷新 updateTime，方便 job 扫到该 data 进行处理。
    const updateTime = mongoData.updateTime;
    mongoData.updateTime = new Date();
    await mongoData.save();

    const tokens = await this.indexOperation.insertVectorForPatch({
      patchResult,
      teamId: mongoData.teamId,
      datasetId: mongoData.datasetId,
      collectionId: mongoData.collectionId
    });

    const newIndexes = this.indexOperation.getWritablePatchIndexes(patchResult);
    const deleteVectorIdList = this.indexOperation.getDeleteVectorIdList(patchResult);

    await mongoSessionRun(async (session) => {
      // 仅在 Q/A 变化时记录历史，最多保留最近 10 条旧内容。
      mongoData.history =
        nextQ !== mongoData.q || nextA !== mongoData.a
          ? [
              {
                q: mongoData.q,
                a: mongoData.a,
                updateTime
              },
              ...(mongoData.history?.slice(0, 9) || [])
            ]
          : mongoData.history;
      mongoData.q = nextQ;
      mongoData.a = nextA;
      mongoData.indexes = newIndexes;
      await mongoData.save({ session });

      // Q/A 变化会影响全文检索结果，需要和主数据一并更新。
      await MongoDatasetDataText.updateOne(
        { dataId: mongoData._id },
        { fullTextToken: await jiebaSplit({ text: `${mongoData.q}\n${mongoData.a}`.trim() }) },
        { session }
      );

      // Mongo 已经指向新的 dataId 后再删旧向量，降低检索命中悬空向量 id 的风险。
      await this.indexOperation.deleteVectors({
        teamId: mongoData.teamId,
        idList: deleteVectorIdList
      });
    });

    this.pushCollectionUpdate({
      collectionId: mongoData.collectionId,
      datasetId: mongoData.datasetId,
      teamId: mongoData.teamId
    });

    return {
      tokens
    };
  }

  /**
   * 只重建系统生成的索引：默认文本索引和多模态图片向量索引。
   *
   * “更新索引”按钮不能碰用户手动维护的索引。这里写 Mongo 时基于数据库当前值过滤，
   * 只替换 `default` / `imageEmbedding`，再拼回新生成的系统索引，避免 custom、question、
   * summary、image 等外部索引被格式化、去重或并发覆盖。
   */
  async updateSystemIndexes({
    dataId,
    q,
    a,
    imageId,
    model,
    indexSize = 512,
    indexPrefix,
    imageIndex
  }: UpdateDatasetDataSystemIndexesProps) {
    const mongoData = await MongoDatasetData.findById(dataId);
    if (!mongoData) return Promise.reject('Data not found');

    const embModel = getEmbeddingModel(model)!;
    const nextQ = q ?? mongoData.q ?? '';
    const nextA = a ?? mongoData.a ?? '';
    const nextImageId = imageId ?? mongoData.imageId;
    indexSize = Math.min(embModel.maxToken, indexSize);

    const systemIndexes = await this.indexOperation.getSystemIndexes({
      q: nextQ,
      a: nextA,
      imageId: nextImageId,
      imageIndex,
      indexSize,
      maxIndexSize: embModel.maxToken,
      indexPrefix
    });
    // 系统索引文本没变化时复用旧 dataId，避免无意义的向量重建。
    const nextSystemIndexDrafts = this.indexOperation.mergeExistingSystemIndexIds({
      currentIndexes: mongoData.indexes,
      nextSystemIndexes: systemIndexes
    });

    const patchResult = this.indexOperation.buildPatch({
      currentIndexes: mongoData.indexes,
      nextIndexes: nextSystemIndexDrafts,
      currentIndexFilter: (index) => isDatasetDataSystemIndexType(index.type),
      isSameIndex: (current, next) => current.text === next.text && current.type === next.type
    });

    const tokens = await this.indexOperation.insertVectorForPatch({
      patchResult,
      teamId: mongoData.teamId,
      datasetId: mongoData.datasetId,
      collectionId: mongoData.collectionId
    });

    const nextSystemIndexes = this.indexOperation.getWritablePatchIndexes(patchResult);
    const deleteVectorIdList = this.indexOperation.getDeleteVectorIdList(patchResult);
    const updateTime = mongoData.updateTime;
    const isDataChanged = nextQ !== mongoData.q || nextA !== mongoData.a;

    await mongoSessionRun(async (session) => {
      await MongoDatasetData.updateOne(
        { _id: mongoData._id },
        [
          {
            $set: {
              ...(isDataChanged
                ? {
                    history: {
                      $literal: [
                        {
                          q: mongoData.q,
                          a: mongoData.a,
                          updateTime
                        },
                        ...(mongoData.history?.slice(0, 9) || [])
                      ]
                    }
                  }
                : {}),
              q: { $literal: nextQ },
              a: { $literal: nextA },
              indexes: {
                $concatArrays: [
                  {
                    $filter: {
                      input: '$indexes',
                      as: 'index',
                      cond: {
                        $not: [{ $in: ['$$index.type', datasetDataSystemIndexTypes] }]
                      }
                    }
                  },
                  { $literal: nextSystemIndexes }
                ]
              },
              updateTime: { $literal: new Date() }
            }
          }
        ],
        { session }
      );

      await MongoDatasetDataText.updateOne(
        { dataId: mongoData._id },
        { fullTextToken: await jiebaSplit({ text: `${nextQ}\n${nextA}`.trim() }) },
        { session }
      );

      await this.indexOperation.deleteVectors({
        teamId: mongoData.teamId,
        idList: deleteVectorIdList
      });
    });

    this.pushCollectionUpdate({
      collectionId: mongoData.collectionId,
      datasetId: mongoData.datasetId,
      teamId: mongoData.teamId
    });

    return {
      tokens
    };
  }

  /**
   * 删除一条 dataset data 以及所有派生资源。
   *
   * 删除范围包含主数据、全文检索 token、图片文件和向量记录。图片 key 需要先校验，
   * 防止误删非 dataset 来源的 S3 对象。
   */
  async delete(data: DatasetDataItemType) {
    await mongoSessionRun(async (session) => {
      await MongoDatasetData.deleteOne({ _id: data.id }, { session });
      await MongoDatasetDataText.deleteMany({ dataId: data.id }, { session });

      // 主数据删除后清理图片对象，避免孤儿文件继续占用存储。
      if (data.imageId && isS3ObjectKey(data.imageId, 'dataset')) {
        await getS3DatasetSource().deleteDatasetFileByKey(data.imageId);
      }

      // data.indexes 中的 dataId 即向量 id，删除数据时需要全部清理。
      await this.indexOperation.deleteVectors({
        teamId: data.teamId,
        idList: data.indexes.map((item) => item.dataId)
      });
    });

    this.pushCollectionUpdate({
      collectionId: data.collectionId,
      datasetId: data.datasetId,
      teamId: data.teamId
    });
  }
}

/**
 * 创建 dataset data 的服务函数。
 * API 层使用该函数完成数据、全文索引、向量和图片 TTL 的一次性写入。
 */
export const createDatasetData = async (
  props: CreateDatasetDataPropsType & {
    embeddingModel: string;
    indexSize?: number;
    imageIndex?: boolean;
    imageDescMap?: Record<string, string>;
    session?: ClientSession;
  }
) => {
  return new DatasetDataOperation(props.embeddingModel).create(props);
};

/**
 * 按完整 indexes 更新 dataset data。
 * 适用于调用方显式提交整组索引的场景。
 */
export const updateDatasetDataByIndexes = async (props: UpdateDatasetDataByIndexesProps) => {
  return new DatasetDataOperation(props.model).updateByIndexes(props);
};

/**
 * 根据数据内容更新系统索引，同时保留外部索引。
 * 系统索引包含 default 文本索引和 imageEmbedding 图片向量索引。
 */
export const updateDatasetDataSystemIndexes = async (
  props: UpdateDatasetDataSystemIndexesProps
) => {
  return new DatasetDataOperation(props.model).updateSystemIndexes(props);
};

/**
 * 删除 dataset data 及其全文索引、图片和向量等派生资源。
 */
export const deleteDatasetData = async (data: DatasetDataItemType) => {
  return new DatasetDataOperation().delete(data);
};
