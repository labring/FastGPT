import { getModelHandle } from '../../ai/model';
import { getDatasetModelReference } from '../model';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from './schema';
import type {
  DatasetCollectionSchemaType,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '../training/schema';
import { MongoDatasetData } from '../data/schema';
import { delImgByRelatedId } from '../../../common/file/image/controller';
import { deleteDatasetDataVector } from '../../../common/vectorDB/controller';
import type { Types, ClientSession } from '../../../common/mongo';
import { getLogger, LogCategories } from '../../../common/logger';
import { createOrGetCollectionTags } from './utils';
import { rawText2Chunks } from '../read';
import { checkDatasetIndexLimit } from '../../../support/permission/teamLimit';
import { predictDataLimitLength } from '../../../../global/core/dataset/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { createTrainingUsage } from '../../../support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

import { pushDataListToTrainingQueue, pushDatasetToParseQueue } from '../training/controller';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getFullTextStore } from '../data/textStore';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getTrainingModeByCollection } from './utils';
import { getDatasetImageIndexCapability } from '../utils';
import {
  computedCollectionChunkSettings,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { removeS3TTL, isS3ObjectKey } from '../../../common/s3/utils';
import {
  createCollectionPermission,
  deleteCollectionPermissions
} from '../../../support/permission/collection/controller';
import type {
  CreateCollectionWithResultResponseType,
  ApiCreateDatasetCollectionParams
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

const logger = getLogger(LogCategories.MODULE.DATASET);

/** folder 骨架按层 insertMany 的批大小 */
export const API_FILE_FOLDER_BATCH_SIZE = 500;
/** file 单个事务覆盖的节点数上限 */
export const API_FILE_FILE_BATCH_SIZE = 200;

export type BulkInsertCollectionDoc = {
  /** 调用方预生成的 ObjectId，以便同轮后续节点直接引用 */
  _id: Types.ObjectId;
  name: string;
  type: DatasetCollectionTypeEnum;
  apiFileId: string;
  apiFileParentId?: string | null;
  parentId: Types.ObjectId | null;
};

/**
 * 分批 insertMany 建 folder 骨架，不走事务。
 * 批失败时按 _id 回查实际落库情况：insertMany 非原子，整批标记失败会漏掉已落库文档，
 * 后续重新导入又会因 apiFileId 已存在而跳过它们。
 */
export const bulkInsertCollections = async ({
  teamId,
  tmbId,
  datasetId,
  docs
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  docs: BulkInsertCollectionDoc[];
}): Promise<{ successApiFileIds: string[]; failedApiFileIds: string[] }> => {
  const successApiFileIds: string[] = [];
  const failedApiFileIds: string[] = [];
  if (docs.length === 0) return { successApiFileIds, failedApiFileIds };

  for (let i = 0; i < docs.length; i += API_FILE_FOLDER_BATCH_SIZE) {
    const batch = docs.slice(i, i + API_FILE_FOLDER_BATCH_SIZE);

    try {
      // 不写 tags：folder 沿用旧行为不带标签（走 createOneCollection 的旧代码也没传），schema default 为 []
      await MongoDatasetCollection.insertMany(
        batch.map((doc) => ({
          ...doc,
          teamId,
          tmbId,
          datasetId
        })),
        { ordered: false }
      );
      successApiFileIds.push(...batch.map((doc) => doc.apiFileId));
    } catch (error) {
      const landed = await MongoDatasetCollection.find(
        { teamId, _id: { $in: batch.map((doc) => doc._id) } },
        '_id'
      ).lean();
      const landedIds = new Set(landed.map((item) => String(item._id)));

      for (const doc of batch) {
        if (landedIds.has(String(doc._id))) successApiFileIds.push(doc.apiFileId);
        else failedApiFileIds.push(doc.apiFileId);
      }

      logger.warn('Bulk insert folder batch failed', {
        teamId,
        datasetId,
        batchSize: batch.length,
        landedSize: landed.length,
        error
      });
    }
  }

  return { successApiFileIds, failedApiFileIds };
};

export type BulkUpdateCollectionParentItem = {
  _id: string;
  parentId: Types.ObjectId;
  apiFileParentId: string;
};

/** 批量校正已存在节点的层级；按目标值直接 $set，重复执行天然幂等。不抛异常。 */
export const bulkUpdateCollectionsParent = async ({
  teamId,
  updates
}: {
  teamId: string;
  updates: BulkUpdateCollectionParentItem[];
}): Promise<{ successIds: string[]; failedIds: string[] }> => {
  const successIds: string[] = [];
  const failedIds: string[] = [];
  if (updates.length === 0) return { successIds, failedIds };

  try {
    const result = await MongoDatasetCollection.bulkWrite(
      updates.map((item) => ({
        updateOne: {
          filter: { _id: item._id, teamId },
          update: {
            // schema 的 parentId 声明为 string（ObjectIdSchema），传 hex 串由 mongoose 转回 ObjectId
            $set: { parentId: String(item.parentId), apiFileParentId: item.apiFileParentId }
          }
        }
      })),
      { ordered: false }
    );

    const failedIndexes = new Set(
      ((result as unknown as { writeErrors?: Array<{ index: number }> }).writeErrors ?? []).map(
        (item) => item.index
      )
    );
    updates.forEach((item, index) => {
      if (failedIndexes.has(index)) failedIds.push(item._id);
      else successIds.push(item._id);
    });
  } catch (error) {
    logger.warn('Bulk update collection parent failed', {
      teamId,
      count: updates.length,
      error
    });
    failedIds.push(...updates.map((item) => item._id));
  }

  return { successIds, failedIds };
};

export const createCollectionAndInsertData = async ({
  dataset,
  rawText,
  imageIds,
  createCollectionParams,
  backupParse = false,
  billId,
  session
}: {
  dataset: DatasetSchemaType;
  rawText?: string;
  imageIds?: string[];
  createCollectionParams: CreateOneCollectionParams;

  backupParse?: boolean;

  billId?: string;
  session?: ClientSession;
}): Promise<CreateCollectionWithResultResponseType> => {
  const modelHandle = await getModelHandle();
  const agentModelData = modelHandle.getLLMModelData(getDatasetModelReference(dataset, 'agent'));
  const embeddingModelData = modelHandle.getEmbeddingModelData(
    getDatasetModelReference(dataset, 'embedding')
  );
  const vlmModelData = modelHandle.getVlmModelData(getDatasetModelReference(dataset, 'vlm'), {
    optional: true
  });

  // Adapter 4.9.0
  if (createCollectionParams.trainingType === DatasetCollectionDataProcessModeEnum.auto) {
    createCollectionParams.trainingType = DatasetCollectionDataProcessModeEnum.chunk;
    createCollectionParams.autoIndexes = true;
  }

  const formatCreateCollectionParams = computedCollectionChunkSettings({
    ...createCollectionParams,
    llmModel: agentModelData,
    vectorModel: embeddingModelData
  });

  const teamId = formatCreateCollectionParams.teamId;
  const tmbId = formatCreateCollectionParams.tmbId;

  // Set default params
  const trainingType =
    formatCreateCollectionParams.trainingType || DatasetCollectionDataProcessModeEnum.chunk;
  const trainingMode = getTrainingModeByCollection({
    trainingType: trainingType,
    autoIndexes: formatCreateCollectionParams.autoIndexes,
    imageIndex: formatCreateCollectionParams.imageIndex,
    supportImageIndex: getDatasetImageIndexCapability({
      vectorModel: embeddingModelData,
      vlmModel: vlmModelData
    }).supportImageIndex
  });

  if (
    trainingType === DatasetCollectionDataProcessModeEnum.qa ||
    trainingType === DatasetCollectionDataProcessModeEnum.backup ||
    trainingType === DatasetCollectionDataProcessModeEnum.template
  ) {
    delete formatCreateCollectionParams.chunkTriggerType;
    delete formatCreateCollectionParams.chunkTriggerMinSize;
    delete formatCreateCollectionParams.dataEnhanceCollectionName;
    delete formatCreateCollectionParams.imageIndex;
    delete formatCreateCollectionParams.autoIndexes;

    if (
      trainingType === DatasetCollectionDataProcessModeEnum.backup ||
      trainingType === DatasetCollectionDataProcessModeEnum.template
    ) {
      delete formatCreateCollectionParams.paragraphChunkAIMode;
      delete formatCreateCollectionParams.paragraphChunkDeep;
      delete formatCreateCollectionParams.paragraphChunkMinSize;
      delete formatCreateCollectionParams.chunkSplitMode;
      delete formatCreateCollectionParams.chunkSize;
      delete formatCreateCollectionParams.chunkSplitter;
      delete formatCreateCollectionParams.indexSize;
      delete formatCreateCollectionParams.indexPrefixTitle;
    }
  }
  if (trainingType !== DatasetCollectionDataProcessModeEnum.qa) {
    delete formatCreateCollectionParams.qaPrompt;
  }

  // 1. split chunks or create image chunks
  const {
    chunks,
    chunkSize,
    indexSize
  }: {
    chunks: Array<{
      q?: string;
      a?: string; // answer or custom content
      imageId?: string;
      indexes?: string[];
    }>;
    chunkSize?: number;
    indexSize?: number;
  } = await (async () => {
    if (rawText) {
      // Process text chunks
      const chunks = await rawText2Chunks({
        rawText,
        chunkTriggerType: formatCreateCollectionParams.chunkTriggerType,
        chunkTriggerMinSize: formatCreateCollectionParams.chunkTriggerMinSize,
        chunkSize: formatCreateCollectionParams.chunkSize,
        paragraphChunkDeep: formatCreateCollectionParams.paragraphChunkDeep,
        paragraphChunkMinSize: formatCreateCollectionParams.paragraphChunkMinSize,
        maxSize: getLLMMaxChunkSize(agentModelData),
        overlapRatio: trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
        customReg: formatCreateCollectionParams.chunkSplitter
          ? [formatCreateCollectionParams.chunkSplitter]
          : [],
        chunkSettingMode: formatCreateCollectionParams.chunkSettingMode,
        trainingType,
        backupParse
      });
      return {
        chunks,
        chunkSize: formatCreateCollectionParams.chunkSize,
        indexSize: formatCreateCollectionParams.indexSize
      };
    }

    if (imageIds) {
      // Process image chunks
      const chunks = imageIds.map((imageId: string) => ({
        imageId,
        indexes: []
      }));
      return { chunks };
    }

    return {
      chunks: [],
      chunkSize: formatCreateCollectionParams.chunkSize,
      indexSize: formatCreateCollectionParams.indexSize
    };
  })();

  // 2. auth limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(trainingMode, chunks)
  });

  const fn = async (session: ClientSession): Promise<CreateCollectionWithResultResponseType> => {
    // 3. Create collection
    const { _id: collectionId } = await createOneCollection({
      ...formatCreateCollectionParams,
      trainingType,
      chunkSize,
      indexSize,

      hashRawText: rawText ? hashStr(rawText) : undefined,
      rawTextLength: rawText?.length,
      session
    });

    // 4. create training bill
    const traingUsageId = await (async () => {
      if (billId) return billId;
      const { usageId: newUsageId } = await createTrainingUsage({
        teamId,
        tmbId,
        appName: formatCreateCollectionParams.name,
        billSource: UsageSourceEnum.training,
        vectorModelId: embeddingModelData.modelId!,
        agentModelId: agentModelData.modelId,
        vllmModelId: vlmModelData?.modelId,
        session
      });
      return newUsageId;
    })();

    // 5. insert to training queue
    const insertResults = await (async () => {
      if (rawText || imageIds) {
        return pushDataListToTrainingQueue({
          teamId,
          tmbId,
          datasetId: dataset._id,
          collectionId,
          agentModel: agentModelData,
          vectorModel: embeddingModelData,
          vlmModel: vlmModelData,
          indexSize,
          mode: trainingMode,
          billId: traingUsageId,
          data: chunks.map((item, index) => ({
            ...item,
            indexes: item.indexes?.map((text) => ({
              type: DatasetDataIndexTypeEnum.custom,
              text
            })),
            chunkIndex: index
          })),
          session
        });
      } else {
        await pushDatasetToParseQueue({
          teamId,
          tmbId,
          datasetId: dataset._id,
          collectionId,
          billId: traingUsageId,
          session
        });
        return {
          insertLen: 0
        };
      }
    })();

    return {
      collectionId: String(collectionId),
      results: {
        insertLen: insertResults.insertLen
      }
    };
  };

  if (session) {
    return fn(session);
  }
  return mongoSessionRun(fn);
};

export type CreateOneCollectionParams = ApiCreateDatasetCollectionParams & {
  teamId: string;
  tmbId: string;
  name: string;
  type: DatasetCollectionTypeEnum;
  fileId?: string;
  rawLink?: string;
  externalFileId?: string;
  externalFileUrl?: string;
  apiFileId?: string;
  apiFileParentId?: string;
  rawTextLength?: number;
  hashRawText?: string;
  createTime?: Date;
  updateTime?: Date;
  session?: ClientSession;
};
export async function createOneCollection({ session, ...props }: CreateOneCollectionParams) {
  const fn = async (s: ClientSession) => {
    const {
      teamId,
      parentId,
      datasetId,
      tags,

      fileId,
      rawLink,
      externalFileId,
      externalFileUrl,
      apiFileId,
      apiFileParentId
    } = props;

    // Resolve tags: string names → ObjectId, {tag, value} → {tagId, value}
    const collectionTags = await createOrGetCollectionTags({
      tags,
      teamId,
      datasetId,
      session: s
    });

    // Create collection
    const [collection] = await MongoDatasetCollection.create(
      [
        {
          ...props,
          _id: undefined,

          parentId: parentId || null,

          tags: collectionTags,

          ...(fileId ? { fileId } : {}),
          ...(rawLink ? { rawLink } : {}),
          ...(externalFileId ? { externalFileId } : {}),
          ...(externalFileUrl ? { externalFileUrl } : {}),
          ...(apiFileId ? { apiFileId } : {}),
          ...(apiFileParentId ? { apiFileParentId } : {})
        }
      ],
      { session: s, ordered: true }
    );

    if (isS3ObjectKey(fileId, 'dataset')) {
      await removeS3TTL({ key: fileId, bucketName: 'private', session: s });
    }

    // 创建 Collection 权限初始化（与文档创建同一事务）：
    // 继承态写 merge(父级有效 clbs, [owner]) 完整快照（根 collection 父级 = dataset）；
    // 独立态仅 owner 记录，并标记所属 dataset 已配置 collection 权限。
    await createCollectionPermission({
      resource: {
        _id: String(collection._id),
        teamId: String(collection.teamId),
        type: collection.type,
        parentId: collection.parentId ? String(collection.parentId) : null,
        datasetId: String(collection.datasetId),
        tmbId: String(collection.tmbId),
        inheritPermission: props.inheritPermission
      },
      tmbId: String(collection.tmbId),
      session: s
    });

    return collection;
  };

  if (session) {
    return fn(session);
  }
  return mongoSessionRun(fn);
}

/* delete collection related images/files */
export const delCollectionRelatedSource = async ({
  collections,
  session
}: {
  collections: {
    teamId: string;
    fileId?: string;
    metadata?: {
      relatedImgId?: string;
    };
  }[];
  session?: ClientSession;
}) => {
  if (collections.length === 0) return;

  const teamId = collections[0].teamId;

  if (!teamId) return Promise.reject('teamId is not exist');

  // FIXME: 兼容旧解析图像删除
  const relatedImageIds = collections
    .map((item) => item?.metadata?.relatedImgId || '')
    .filter(Boolean);

  // Delete files and images in parallel
  await Promise.all([
    // Delete images
    delImgByRelatedId({
      teamId,
      relateIds: relatedImageIds,
      session
    })
  ]);
};
/**
 * delete collection and it related data
 */
export async function delCollection({
  collections,
  session,
  delImg = true,
  delFile = true
}: {
  collections: DatasetCollectionSchemaType[];
  session: ClientSession;
  delImg: boolean;
  delFile: boolean;
}) {
  if (collections.length === 0) return;

  const teamId = collections[0].teamId;

  if (!teamId) return Promise.reject('teamId is not exist');

  const s3DatasetSource = getS3DatasetSource();
  const datasetIds = Array.from(new Set(collections.map((item) => String(item.datasetId))));
  const collectionIds = collections.map((item) => String(item._id));

  const imageCollectionIds = collections
    .filter((item) => item.type === DatasetCollectionTypeEnum.images)
    .map((item) => String(item._id));
  const imageDatas = await MongoDatasetData.find(
    {
      teamId,
      datasetId: { $in: datasetIds },
      collectionId: { $in: imageCollectionIds }
    },
    { imageId: 1 }
  ).lean();
  const imageIds = imageDatas
    .map((item) => item.imageId)
    .filter((key) => isS3ObjectKey(key, 'dataset'));

  await retryFn(async () => {
    await Promise.all([
      // Delete training data
      MongoDatasetTraining.deleteMany({
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      }),
      // Delete dataset_data_texts(store 分发:mongo 真实删除,milvus 空操作——全文随向量删除)
      getFullTextStore().deleteByCollectionIds({ teamId, datasetIds, collectionIds }, session),
      // Delete dataset_datas
      MongoDatasetData.deleteMany({
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      }),
      // Delete images if needed
      ...(delImg // 兼容旧图像删除
        ? [
            delImgByRelatedId({
              teamId,
              relateIds: collections
                .map((item) => item?.metadata?.relatedImgId || '')
                .filter(Boolean)
            })
          ]
        : []),
      // Delete files if needed
      ...(delFile
        ? [
            getS3DatasetSource().deleteDatasetFilesByKeys(
              collections.map((item) => item?.fileId || '').filter(Boolean)
            )
          ]
        : []),
      // Delete vector data
      deleteDatasetDataVector({ teamId, datasetIds, collectionIds })
    ]);

    // delete collections
    await MongoDatasetCollection.deleteMany(
      {
        teamId,
        _id: { $in: collectionIds }
      },
      { session }
    ).lean();

    // delete collection permission snapshots (same transaction)
    await deleteCollectionPermissions({ teamId, collectionIds, session });

    // delete s3 images which are uploaded by users
    await s3DatasetSource.deleteDatasetFilesByKeys(imageIds);
  });
}

/** 查找 collection 及其全部子节点（parentId 子树）；返回 [根, ...子孙]。 */
export async function findCollectionAndAllChildren({
  teamId,
  collectionId,
  fields = '_id datasetId'
}: {
  teamId: string;
  collectionId: string;
  fields?: string;
}) {
  const find = async (id: string): Promise<any[]> => {
    const children = await MongoDatasetCollection.find({ teamId, parentId: id }, fields).lean();
    let list = children;
    for (const child of children) {
      list = list.concat(await find(String(child._id)));
    }
    return list;
  };
  const [root, children] = await Promise.all([
    MongoDatasetCollection.findById(collectionId).lean(),
    find(collectionId)
  ]);
  if (!root) {
    throw new Error('Collection not found');
  }
  return [root, ...children];
}
