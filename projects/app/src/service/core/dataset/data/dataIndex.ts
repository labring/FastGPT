import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  deleteDatasetDataVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';
import type {
  DatasetDataIndexItemType,
  DatasetDataItemType
} from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModel, isImageEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { text2Chunks } from '@fastgpt/service/worker/function';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.schema';
import {
  isValidImageEmbeddingSource,
  normalizeImageToBase64
} from '@fastgpt/service/core/dataset/search/utils';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { uniqueDatasetDataMarkdownImageUrls } from '@fastgpt/service/core/dataset/data/utils';
import { isDatasetDataSystemIndexType } from '@fastgpt/global/core/dataset/data/utils';

export type DatasetDataIndexDraft = Omit<DatasetDataIndexItemType, 'dataId'> & {
  dataId?: string;
};

/**
 * 描述一组新的索引应该如何应用到已有索引。
 *
 * `dataId` 同时也是向量库里的向量 id。更新索引时，patch 会先保留旧的
 * dataId，等新向量写入成功后再替换成新的向量 id，最后写回 MongoDB。
 */
export type DatasetDataIndexPatch =
  | {
      type: 'create';
      index: DatasetDataIndexDraft;
      skipped?: boolean;
    }
  | {
      type: 'update';
      index: DatasetDataIndexItemType;
      skipped?: boolean;
    }
  | {
      type: 'delete';
      index: DatasetDataIndexItemType;
    }
  | {
      type: 'unChange';
      index: DatasetDataIndexItemType;
    };

/**
 * 给索引文本补充集合上下文，让检索时能利用前缀信息。
 * 这里需要保持幂等，因为调用方可能传入已经在上一次全量更新中加过前缀的索引。
 */
const formatIndexTextWithPrefix = (text: string, indexPrefix?: string) => {
  if (indexPrefix && !text.startsWith(indexPrefix)) {
    return `${indexPrefix}\n${text}`;
  }
  return text;
};

const isImageEmbeddingIndex = (index: DatasetDataIndexDraft) =>
  index.type === DatasetDataIndexTypeEnum.imageEmbedding;

const normalizeDatasetIndexImageToModelInput = async (imageUrl: string) => {
  if (
    isS3ObjectKey(imageUrl, 'dataset') ||
    isS3ObjectKey(imageUrl, 'temp') ||
    isS3ObjectKey(imageUrl, 'chat')
  ) {
    return getS3DatasetSource().getDatasetBase64Image(imageUrl);
  }

  return normalizeImageToBase64(imageUrl);
};

/**
 * 数据索引变更的共享操作类。
 *
 * 这里集中维护索引的完整生命周期：
 * - 根据数据内容生成系统索引
 * - 在向量化前规范化并切分自定义索引
 * - 对比当前索引和下一版索引，生成 patch
 * - 写入或删除向量记录
 * - 更新 Mongo 中的 `indexes` 数组
 *
 * 这些步骤需要放在一起维护，因为 Mongo 索引里的 `dataId` 必须和向量库 id 保持一致。
 */
export class DatasetDataIndexOperation {
  private readonly model?: string | EmbeddingModelItemType;

  constructor(model?: string | EmbeddingModelItemType) {
    this.model = model;
  }

  get maxToken() {
    return this.getEmbeddingModel().maxToken;
  }

  private getEmbeddingModel(): EmbeddingModelItemType {
    return (typeof this.model === 'string' ? getEmbeddingModel(this.model) : this.model)!;
  }

  /**
   * 从数据正文中收集需要生成图片向量的图片源。
   *
   * 主图片 `imageId` 是图片数据自身的内容，只要模型支持图片向量就会生成；
   * markdown 图片受 collection 的 imageIndex 开关控制，避免未开启图片索引的普通文本
   * 数据被隐式生成额外图片向量。
   */
  getImageEmbeddingSources({
    q = '',
    a = '',
    imageId, // 纯图数据
    imageIndex // 文本数据，是否需要提取图片
  }: {
    q?: string;
    a?: string;
    imageId?: string;
    imageIndex?: boolean;
  }) {
    if (!isImageEmbeddingModel(this.getEmbeddingModel())) return [];

    const sources = [
      ...(imageId ? [imageId] : []),
      ...(imageIndex ? uniqueDatasetDataMarkdownImageUrls([q, a]) : [])
    ];

    return Array.from(new Set(sources.filter(isValidImageEmbeddingSource)));
  }

  /**
   * 根据数据内容生成系统维护的索引。
   *
   * 系统索引包含：
   * - `default`：由 question/answer 切分出的文本向量索引；
   * - `imageEmbedding`：由主图片和 markdown 图片源生成的图片向量索引。
   *
   * 这些索引由数据内容重新生成，不允许用户单独编辑。
   */
  async getSystemIndexes({
    q = '',
    a,
    imageId,
    imageIndex,
    indexSize,
    maxIndexSize,
    indexPrefix
  }: {
    q?: string;
    a?: string;
    imageId?: string;
    imageIndex?: boolean;
    indexSize: number;
    maxIndexSize?: number;
    indexPrefix?: string;
  }) {
    const qChunks = (
      await text2Chunks({
        text: q,
        chunkSize: indexSize,
        maxSize: maxIndexSize ?? this.maxToken
      })
    ).chunks;
    const aChunks = a
      ? (
          await text2Chunks({
            text: a,
            chunkSize: indexSize,
            maxSize: maxIndexSize ?? this.maxToken
          })
        ).chunks
      : [];

    return [
      ...qChunks.map((text) => ({
        text: formatIndexTextWithPrefix(text, indexPrefix),
        type: DatasetDataIndexTypeEnum.default
      })),
      ...aChunks.map((text) => ({
        text: formatIndexTextWithPrefix(text, indexPrefix),
        type: DatasetDataIndexTypeEnum.default
      })),
      ...this.getImageEmbeddingSources({
        q,
        a,
        imageId,
        imageIndex
      }).map((text) => ({
        text,
        type: DatasetDataIndexTypeEnum.imageEmbedding
      }))
    ];
  }

  /**
   * 在对比或写入向量前，规范化所有索引草稿。
   *
   * 该流程会保留外部索引、根据数据内容重新生成系统索引、按文本去重，并切分过长的
   * 外部文本索引。文本未变化时会沿用已有 dataId，避免重复重建向量。
   */
  async formatIndexes({
    indexes = [],
    q,
    a = '',
    imageId,
    imageIndex,
    indexSize,
    maxIndexSize,
    indexPrefix
  }: {
    indexes?: DatasetDataIndexDraft[];
    q: string;
    a?: string;
    imageId?: string;
    imageIndex?: boolean;
    indexSize: number;
    maxIndexSize?: number;
    indexPrefix?: string;
  }): Promise<DatasetDataIndexDraft[]> {
    indexes = indexes.map((item) => ({
      text: typeof item.text === 'string' ? item.text : String(item.text),
      type: item.type || DatasetDataIndexTypeEnum.custom,
      dataId: item.dataId
    }));

    const systemIndexes = await this.getSystemIndexes({
      q,
      a,
      imageId,
      imageIndex,
      indexSize,
      maxIndexSize: maxIndexSize ?? this.maxToken,
      indexPrefix
    });

    // 系统索引由当前数据内容重新生成；传入 indexes 里的系统索引只用于复用旧 dataId。
    let systemIndexesWithExistingIds = this.mergeExistingSystemIndexIds({
      currentIndexes: indexes,
      nextSystemIndexes: systemIndexes
    });

    const systemTextIndexTexts = new Set(
      systemIndexesWithExistingIds
        .filter((item) => item.type !== DatasetDataIndexTypeEnum.imageEmbedding)
        .map((item) => item.text)
    );
    const externalIndexes = indexes.filter((item) => !isDatasetDataSystemIndexType(item.type));

    // 若一个普通文本索引被系统 default 覆盖掉，可以复用它的文本向量 id；
    // imageEmbedding 不能复用文本向量，必须按图片输入重新生成。
    systemIndexesWithExistingIds = systemIndexesWithExistingIds.map((item) => {
      if (item.dataId || item.type !== DatasetDataIndexTypeEnum.default) return item;

      const sameTextIndex = externalIndexes.find(
        (index) => index.text === item.text && !!index.dataId
      );

      return sameTextIndex?.dataId
        ? {
            ...item,
            dataId: sameTextIndex.dataId
          }
        : item;
    });

    indexes = indexes.filter(
      (item, index, self) =>
        !isDatasetDataSystemIndexType(item.type) &&
        !systemTextIndexTexts.has(item.text) &&
        index ===
          self.findIndex((t) => !isDatasetDataSystemIndexType(t.type) && t.text === item.text)
    );
    indexes.push(...systemIndexesWithExistingIds);

    const checkedIndexes = (
      await Promise.all(
        indexes.map(async (item) => {
          if (item.type === DatasetDataIndexTypeEnum.imageEmbedding) {
            return item;
          }

          const tokens = await countPromptTokens(item.text);
          if (tokens > (maxIndexSize ?? this.maxToken)) {
            const splitText = (
              await text2Chunks({
                text: item.text,
                chunkSize: indexSize,
                maxSize: maxIndexSize ?? this.maxToken
              })
            ).chunks;
            return splitText.map((text) => ({
              text,
              type: item.type
            }));
          }

          return item;
        })
      )
    )
      .flat()
      .filter((item) => !!item.text.trim());

    return indexPrefix
      ? checkedIndexes.map((index) => {
          // 自定义索引与图片向量索引不需要添加前缀
          if (
            index.type === DatasetDataIndexTypeEnum.custom ||
            index.type === DatasetDataIndexTypeEnum.imageEmbedding
          ) {
            return index;
          }
          return {
            ...index,
            text: formatIndexTextWithPrefix(index.text, indexPrefix)
          };
        })
      : checkedIndexes;
  }

  /**
   * 系统索引重新生成后，重新挂回当前系统索引的 dataId。
   *
   * 系统索引来自内容，调用方通常会先生成没有 id 的草稿。这里按类型和文本匹配，
   * 让未变化的系统索引继续指向已有向量记录。
   */
  mergeExistingSystemIndexIds({
    currentIndexes,
    nextSystemIndexes
  }: {
    currentIndexes: DatasetDataIndexDraft[];
    nextSystemIndexes: DatasetDataIndexDraft[];
  }) {
    const getIndexKey = (index: Pick<DatasetDataIndexDraft, 'type' | 'text'>) =>
      `${index.type || DatasetDataIndexTypeEnum.custom}:${index.text}`;
    const existingSystemIndexMap = new Map(
      currentIndexes
        .filter((index) => isDatasetDataSystemIndexType(index.type))
        .map((index) => [getIndexKey(index), index])
    );

    return nextSystemIndexes.map((index) => {
      const existingIndex = isDatasetDataSystemIndexType(index.type)
        ? existingSystemIndexMap.get(getIndexKey(index))
        : undefined;
      return {
        ...index,
        ...(existingIndex?.dataId && { dataId: existingIndex.dataId })
      };
    });
  }

  /**
   * 对比已存索引和下一版索引，生成需要执行的向量操作。
   *
   * 可选 filter 用于数据级更新时只 patch 系统索引，避免影响人工维护的自定义索引。
   * 可选 comparator 用于让调用方决定除文本外的字段变化是否需要重建向量。
   */
  buildPatch({
    currentIndexes,
    nextIndexes,
    currentIndexFilter,
    isSameIndex
  }: {
    currentIndexes: DatasetDataIndexItemType[];
    nextIndexes: DatasetDataIndexDraft[];
    currentIndexFilter?: (index: DatasetDataIndexItemType) => boolean;
    isSameIndex?: (current: DatasetDataIndexItemType, next: DatasetDataIndexDraft) => boolean;
  }) {
    const patchResult: DatasetDataIndexPatch[] = [];
    const filteredCurrentIndexes = currentIndexFilter
      ? currentIndexes.filter(currentIndexFilter)
      : currentIndexes;

    // 当前过滤集合中存在、但下一版不存在的索引，需要同时删除 Mongo 索引项和向量记录。
    for (const item of filteredCurrentIndexes) {
      const index = nextIndexes.find((index) => index.dataId === item.dataId);
      if (!index) {
        patchResult.push({
          type: 'delete',
          index: item
        });
      }
    }

    // 没有 dataId 的草稿需要创建新向量；已有 dataId 的草稿根据内容变化决定复用或重建。
    for (const item of nextIndexes) {
      if (!item.dataId) {
        patchResult.push({
          type: 'create',
          index: item
        });
        continue;
      }

      const index = currentIndexes.find((index) => index.dataId === item.dataId);
      if (!index) continue;

      if ((isSameIndex ?? ((current, next) => current.text === next.text))(index, item)) {
        patchResult.push({
          type: 'unChange',
          index: {
            ...item,
            dataId: index.dataId
          }
        });
      } else {
        patchResult.push({
          type: 'update',
          index: {
            ...item,
            dataId: index.dataId
          }
        });
      }
    }

    return patchResult;
  }

  /**
   * 收集应用 patch 后会失效的向量 id。
   *
   * update 也需要删除旧向量，因为新向量写入后，patch 中的 dataId 会被替换为新的
   * 向量 id，再写回 Mongo。
   */
  getDeleteVectorIdList(patchResult: DatasetDataIndexPatch[]) {
    return patchResult
      .filter((item) => item.type === 'delete' || item.type === 'update')
      .map((item) => item.index.dataId)
      .filter(Boolean) as string[];
  }

  /**
   * 将 patch 转回 Mongo `indexes` 数组结构。
   * delete 项会被过滤掉，create/update/unChange 项会保留下来。
   */
  getWritablePatchIndexes(patchResult: DatasetDataIndexPatch[]) {
    return patchResult
      .filter((item) => item.type !== 'delete' && !('skipped' in item && item.skipped))
      .map((item) => item.index) as DatasetDataIndexItemType[];
  }

  private async insertIndexVectorIds({
    indexes,
    teamId,
    datasetId,
    collectionId
  }: {
    indexes: DatasetDataIndexDraft[];
    teamId: string;
    datasetId: string;
    collectionId: string;
  }) {
    const embModel = this.getEmbeddingModel();
    const vectorInputItems = (
      await Promise.all(
        indexes.map(async (index) => {
          if (!isImageEmbeddingIndex(index)) {
            return {
              item: index,
              input: index.text
            };
          }

          if (!isImageEmbeddingModel(embModel) || !isValidImageEmbeddingSource(index.text)) {
            return;
          }

          try {
            return {
              item: index,
              input: {
                type: 'image' as const,
                input: await normalizeDatasetIndexImageToModelInput(index.text)
              }
            };
          } catch {
            return;
          }
        })
      )
    ).filter(Boolean) as {
      item: DatasetDataIndexDraft;
      input: string | { type: 'image'; input: string };
    }[];

    const insertResult = vectorInputItems.length
      ? await insertDatasetDataVector({
          inputs: vectorInputItems.map((item) => item.input),
          model: embModel,
          teamId,
          datasetId,
          collectionId
        })
      : { tokens: 0, insertIds: [] as string[] };

    const insertedIndexIdMap = new WeakMap<DatasetDataIndexDraft, string>();
    vectorInputItems.forEach(({ item }, index) => {
      const dataId = insertResult.insertIds[index];
      if (dataId) {
        insertedIndexIdMap.set(item, dataId);
      }
    });

    return {
      tokens: insertResult.tokens,
      insertedIndexIdMap
    };
  }

  /**
   * 为需要新向量 id 的 patch 项写入向量。
   *
   * 这里会原地修改 patch，让后续 Mongo 写入直接使用新的 dataId，避免调用方再做一次映射。
   */
  async insertVectorForPatch({
    patchResult,
    teamId,
    datasetId,
    collectionId
  }: {
    patchResult: DatasetDataIndexPatch[];
    teamId: string;
    datasetId: string;
    collectionId: string;
  }) {
    const insertItems = patchResult.filter(
      (item) => item.type === 'create' || item.type === 'update'
    );
    if (insertItems.length === 0) return 0;

    const { tokens, insertedIndexIdMap } = await this.insertIndexVectorIds({
      indexes: insertItems.map((item) => item.index),
      teamId,
      datasetId,
      collectionId
    });

    insertItems.forEach((item) => {
      const dataId = insertedIndexIdMap.get(item.index);
      if (dataId) {
        item.index.dataId = dataId;
      } else {
        item.skipped = true;
      }
    });

    return tokens;
  }

  /**
   * 为一组新的索引草稿写入向量。
   * 单个索引创建/更新路径没有 patch 对象，会使用这个方法。
   */
  async insertVectors({
    indexes,
    teamId,
    datasetId,
    collectionId
  }: {
    indexes: DatasetDataIndexDraft[];
    teamId: string;
    datasetId: string;
    collectionId: string;
  }) {
    const { tokens, insertedIndexIdMap } = await this.insertIndexVectorIds({
      indexes,
      teamId,
      datasetId,
      collectionId
    });

    return {
      tokens,
      indexes: indexes
        .map((item) => {
          const dataId = insertedIndexIdMap.get(item);
          if (!dataId) return;
          return {
            ...item,
            dataId
          };
        })
        .filter(Boolean) as DatasetDataIndexItemType[]
    };
  }

  /**
   * 按 id 删除向量。
   * 调用方需要负责同步删除或替换 Mongo 中的索引项。
   */
  async deleteVectors({ teamId, idList }: { teamId: string; idList: string[] }) {
    if (idList.length === 0) return;
    await deleteDatasetDataVector({
      teamId,
      idList
    });
  }

  /**
   * 创建或更新一条人工维护的数据索引。
   *
   * 系统维护的索引类型不允许单独保存，因为它们的生命周期绑定在数据内容或图片处理上。
   * 更新时会先写入新向量，再替换 Mongo 索引项；旧向量会在索引项替换成功后删除。
   */
  async writeDatasetDataIndex({
    data,
    indexDataId,
    type,
    text
  }: {
    data: DatasetDataItemType;
    indexDataId?: string;
    type: DatasetDataIndexTypeEnum;
    text: string;
  }) {
    const trimText = text.trim();
    if (!trimText) {
      return Promise.reject('Dataset data index text is required');
    }

    if (isDatasetDataSystemIndexType(type)) {
      return Promise.reject('System indexes cannot be saved separately');
    }

    const textTokens = await countPromptTokens(trimText);
    if (textTokens > this.maxToken) {
      return Promise.reject('Dataset data index text is too long');
    }

    const targetIndex = indexDataId
      ? data.indexes.find((item) => item.dataId === indexDataId)
      : undefined;

    // 有 indexDataId 但是找不到对应的 index，认为是错误的数据
    if (indexDataId && !targetIndex) {
      return Promise.reject('Dataset data index not found');
    }

    // 内容和类型都没变时直接复用旧索引，避免重复消耗 embedding tokens。
    if (targetIndex && targetIndex.text === trimText && targetIndex.type === type) {
      return {
        index: targetIndex,
        tokens: 0
      };
    }

    const { indexes, tokens } = await this.insertVectors({
      indexes: [
        {
          type,
          text: trimText
        }
      ],
      teamId: data.teamId,
      datasetId: data.datasetId,
      collectionId: data.collectionId
    });
    const newIndex = indexes[0];

    await mongoSessionRun(async (session) => {
      if (targetIndex) {
        // 先把 Mongo 索引替换成新的向量 id，再删除旧向量，避免检索指向不存在的向量记录。
        await MongoDatasetData.updateOne(
          { _id: data.id, 'indexes.dataId': targetIndex.dataId },
          {
            $set: {
              'indexes.$': newIndex,
              updateTime: new Date()
            }
          },
          { session }
        );

        await this.deleteVectors({
          teamId: data.teamId,
          idList: [targetIndex.dataId]
        });
      } else {
        // 人工添加的索引放在前面，后续读取时优先展示用户创建的检索提示。
        await MongoDatasetData.updateOne(
          { _id: data.id },
          {
            $push: {
              indexes: {
                $each: [newIndex],
                $position: 0
              }
            },
            $set: {
              updateTime: new Date()
            }
          },
          { session }
        );
      }
    });

    pushCollectionUpdateJob({
      collectionId: String(data.collectionId),
      datasetId: String(data.datasetId),
      teamId: String(data.teamId)
    });

    return {
      index: newIndex,
      tokens
    };
  }

  /**
   * 删除一条人工维护的数据索引及其向量记录。
   */
  async deleteDatasetDataIndex({
    data,
    indexDataId
  }: {
    data: DatasetDataItemType;
    indexDataId: string;
  }) {
    const targetIndex = data.indexes.find((item) => item.dataId === indexDataId);
    if (!targetIndex) {
      return Promise.reject('Dataset data index not found');
    }
    if (isDatasetDataSystemIndexType(targetIndex.type)) {
      return Promise.reject('System indexes cannot be deleted separately');
    }

    await mongoSessionRun(async (session) => {
      await MongoDatasetData.updateOne(
        { _id: data.id },
        {
          $pull: {
            indexes: { dataId: indexDataId }
          },
          $set: {
            updateTime: new Date()
          }
        },
        { session }
      );

      await this.deleteVectors({
        teamId: data.teamId,
        idList: [indexDataId]
      });
    });

    pushCollectionUpdateJob({
      collectionId: String(data.collectionId),
      datasetId: String(data.datasetId),
      teamId: String(data.teamId)
    });
  }
}

/**
 * 创建一条自定义数据索引及其向量记录。
 *
 * 底层操作会校验该索引不是系统维护类型，使用指定 embedding 模型写入新向量，
 * 将生成的向量 dataId 追加到 data.indexes，并返回创建后的索引和 token 消耗。
 */
export const createDatasetDataIndex = async ({
  data,
  type,
  text,
  model
}: {
  data: DatasetDataItemType;
  type: DatasetDataIndexTypeEnum;
  text: string;
  model: string;
}) => {
  return new DatasetDataIndexOperation(model).writeDatasetDataIndex({
    data,
    type,
    text
  });
};

/**
 * 更新一条已有的自定义数据索引，并按需重建向量记录。
 *
 * 如果文本和类型都未变化，不会重新生成向量。否则会先写入替换向量，再替换 Mongo
 * 中的索引项，最后删除旧向量，并返回更新后的索引和 token 消耗。
 */
export const updateDatasetDataIndex = async ({
  data,
  indexDataId,
  type,
  text,
  model
}: {
  data: DatasetDataItemType;
  indexDataId: string;
  type: DatasetDataIndexTypeEnum;
  text: string;
  model: string;
}) => {
  return new DatasetDataIndexOperation(model).writeDatasetDataIndex({
    data,
    indexDataId,
    type,
    text
  });
};

export const deleteDatasetDataIndex = async ({
  data,
  indexDataId
}: {
  data: DatasetDataItemType;
  indexDataId: string;
}) => {
  return new DatasetDataIndexOperation().deleteDatasetDataIndex({
    data,
    indexDataId
  });
};
