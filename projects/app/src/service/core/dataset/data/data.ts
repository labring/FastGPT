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
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { isS3ObjectKey, removeS3TTL } from '@fastgpt/service/common/s3/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { DatasetDataIndexOperation } from '@/service/core/dataset/data/dataIndex';

type UpdateDatasetDataByIndexesProps = Omit<UpdateDatasetDataPropsType, 'indexes'> & {
  indexes: NonNullable<UpdateDatasetDataPropsType['indexes']>;
  model: string;
  indexSize?: number;
};

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
    imageDescMap,
    session
  }: CreateDatasetDataPropsType & {
    embeddingModel: string;
    indexSize?: number;
    imageDescMap?: Record<string, string>;
    session?: ClientSession;
  }) {
    if (!q || !datasetId || !collectionId || !embeddingModel) {
      return Promise.reject('q, datasetId, collectionId, embeddingModel is required');
    }

    const embModel = getEmbeddingModel(embeddingModel);
    indexSize = Math.min(embModel.maxToken, indexSize);

    // 默认索引和自定义索引在这里统一规范化，确保后续向量写入的输入已去重、切分。
    const newIndexes = await this.indexOperation.formatIndexes({
      indexes,
      q,
      a,
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
          q,
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
          fullTextToken: await jiebaSplit({ text: `${q}\n${a}`.trim() })
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
   * 这个路径用于“手动指定全部索引”的更新：调用方给出的 indexes 会和当前 indexes 做
   * diff，新增/变更的索引重建向量，删除的索引清理旧向量。与 updateDefaultIndexes 不同，
   * 它会以传入 indexes 为准更新整组索引。
   */
  async updateByIndexes({
    dataId,
    q = '',
    a,
    indexes,
    model,
    indexSize = 512,
    indexPrefix
  }: UpdateDatasetDataByIndexesProps) {
    if (!Array.isArray(indexes)) {
      return Promise.reject('indexes is required');
    }

    const mongoData = await MongoDatasetData.findById(dataId);
    if (!mongoData) return Promise.reject('Data not found');

    const nextQ = q || mongoData.q || '';
    const nextA = a ?? mongoData.a ?? '';

    const formatIndexesResult = await this.indexOperation.formatIndexes({
      indexes,
      q: nextQ,
      a: nextA,
      indexSize,
      maxIndexSize: getEmbeddingModel(model).maxToken,
      indexPrefix
    });
    const indexesWithExistingDefaultIds = this.indexOperation.mergeExistingDefaultIndexIds({
      currentIndexes: mongoData.indexes,
      nextDefaultIndexes: formatIndexesResult
    });

    // patchResult 先保留旧 dataId；insertVectorForPatch 会为 create/update 项写入新向量并回填新 dataId。
    const patchResult = this.indexOperation.buildPatch({
      currentIndexes: mongoData.indexes,
      nextIndexes: indexesWithExistingDefaultIds
    });
    const deleteVectorIdList = this.indexOperation.getDeleteVectorIdList(patchResult);

    // 提前刷新 updateTime，保持旧接口“进入更新流程即更新时间”的行为。
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
   * 只根据 Q/A 重建默认索引，保留人工维护的自定义索引。
   *
   * 数据内容更新时会走这个路径：default 索引来自 Q/A，因此需要重新生成；自定义索引
   * 是用户手动维护的检索提示，不应因为 Q/A 更新被覆盖。
   */
  async updateDefaultIndexes({
    dataId,
    q = '',
    a,
    model,
    indexSize = 512,
    indexPrefix
  }: {
    dataId: string;
    q: string;
    a?: string;
    model: string;
    indexSize?: number;
    indexPrefix?: string;
  }) {
    const mongoData = await MongoDatasetData.findById(dataId);
    if (!mongoData) return Promise.reject('Data not found');

    const embModel = getEmbeddingModel(model);
    indexSize = Math.min(embModel.maxToken, indexSize);

    const defaultIndexes = await this.indexOperation.getDefaultIndexes({
      q,
      a,
      indexSize,
      maxIndexSize: embModel.maxToken,
      indexPrefix
    });
    // 默认索引文本没变化时复用旧 dataId，避免无意义的向量重建。
    const nextDefaultIndexDrafts = this.indexOperation.mergeExistingDefaultIndexIds({
      currentIndexes: mongoData.indexes,
      nextDefaultIndexes: defaultIndexes
    });

    const patchResult = this.indexOperation.buildPatch({
      currentIndexes: mongoData.indexes,
      nextIndexes: nextDefaultIndexDrafts,
      currentIndexFilter: (index) => index.type === DatasetDataIndexTypeEnum.default,
      isSameIndex: (current, next) => current.text === next.text && current.type === next.type
    });
    const deleteVectorIdList = this.indexOperation.getDeleteVectorIdList(patchResult);

    // 只为新增或变化的默认索引写入向量；未变化的索引继续使用原 dataId。
    const tokens = await this.indexOperation.insertVectorForPatch({
      patchResult,
      teamId: mongoData.teamId,
      datasetId: mongoData.datasetId,
      collectionId: mongoData.collectionId
    });

    const nextDefaultIndexes = this.indexOperation.getWritablePatchIndexes(patchResult);

    const updateTime = mongoData.updateTime;
    const nextQ = q || mongoData.q;
    const nextA = a ?? mongoData.a;
    const isDataChanged = nextQ !== mongoData.q || nextA !== mongoData.a;
    const updateFields = {
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
              cond: { $ne: ['$$index.type', DatasetDataIndexTypeEnum.default] }
            }
          },
          { $literal: nextDefaultIndexes }
        ]
      },
      updateTime: { $literal: new Date() }
    };

    await mongoSessionRun(async (session) => {
      // Only replace default indexes at write time. Custom indexes may be created concurrently.
      await MongoDatasetData.updateOne(
        { _id: mongoData._id },
        [
          {
            $set: updateFields
          }
        ],
        { session }
      );

      // 默认索引来自 Q/A，全文检索 token 也必须和 Q/A 同步。
      await MongoDatasetDataText.updateOne(
        { dataId: mongoData._id },
        { fullTextToken: await jiebaSplit({ text: `${nextQ}\n${nextA}`.trim() }) },
        { session }
      );

      // 等 Mongo indexes 更新完成后再删除旧向量，避免短时间内出现悬空引用。
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
 * 根据 Q/A 更新默认索引，同时保留自定义索引。
 * 适用于普通数据内容编辑场景。
 */
export const updateDatasetDataDefaultIndexes = async (props: {
  dataId: string;
  q: string;
  a?: string;
  model: string;
  indexSize?: number;
  indexPrefix?: string;
}) => {
  return new DatasetDataOperation(props.model).updateDefaultIndexes(props);
};

/**
 * 删除 dataset data 及其全文索引、图片和向量等派生资源。
 */
export const deleteDatasetData = async (data: DatasetDataItemType) => {
  return new DatasetDataOperation().delete(data);
};
