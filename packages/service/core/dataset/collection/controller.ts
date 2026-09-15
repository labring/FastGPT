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
import type { ClientSession } from '../../../common/mongo';
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
  addAuditLog,
  failAuditLogByTaskId,
  updateAuditLogByTaskId
} from '../../../support/user/audit/util';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { refreshTrainingAuditTask } from '../training/audit';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { randomUUID } from 'node:crypto';
import { getLogger, LogCategories } from '../../../common/logger';
import type {
  CreateCollectionWithResultResponseType,
  ApiCreateDatasetCollectionParams
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

export const createCollectionAndInsertData = async ({
  dataset,
  rawText,
  imageIds,
  createCollectionParams,
  backupParse = false,
  billId,
  session,
  audit = true,
  auditSourceType,
  auditTaskId
}: {
  dataset: DatasetSchemaType;
  rawText?: string;
  imageIds?: string[];
  createCollectionParams: CreateOneCollectionParams;

  backupParse?: boolean;

  billId?: string;
  session?: ClientSession;
  audit?: boolean;
  auditSourceType?:
    | 'backup'
    | 'template'
    | 'image'
    | 'link'
    | 'external_file'
    | 'api'
    | 'text'
    | 'file';
  auditTaskId?: string;
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

  const auditSource = (() => {
    if (auditSourceType) return auditSourceType;
    if (trainingType === DatasetCollectionDataProcessModeEnum.backup) return 'backup';
    if (trainingType === DatasetCollectionDataProcessModeEnum.template) return 'template';
    if (imageIds) return 'image';
    if (createCollectionParams.rawLink) return 'link';
    if (createCollectionParams.externalFileId || createCollectionParams.externalFileUrl) {
      return 'external_file';
    }
    if (createCollectionParams.apiFileId) return 'api';
    if (rawText) return 'text';
    return 'file';
  })();
  const resolvedAuditTaskId = auditTaskId ?? (audit ? randomUUID() : undefined);
  let auditCreated = false;

  if (resolvedAuditTaskId && audit) {
    await addAuditLog({
      teamId,
      tmbId,
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      params: {
        datasetId: String(dataset._id),
        datasetName: dataset.name,
        collectionName: createCollectionParams.name,
        sourceType: auditSource,
        sourceName: createCollectionParams.name,
        trainingType,
        chunkSize: String(formatCreateCollectionParams.chunkSize ?? ''),
        indexSize: String(formatCreateCollectionParams.indexSize ?? ''),
        result: 'processing',
        insertLen: '1',
        taskId: resolvedAuditTaskId,
        details: [
          {
            resourceName: createCollectionParams.name,
            resourceType: 'collection',
            sourceType: auditSource,
            sourceName: createCollectionParams.name,
            action: 'import',
            result: 'processing',
            processingParams: {
              trainingType,
              chunkSize: formatCreateCollectionParams.chunkSize ?? '',
              indexSize: formatCreateCollectionParams.indexSize ?? ''
            }
          }
        ]
      }
    })
      .then(() => {
        auditCreated = true;
      })
      .catch((error) => {
        logger.warn('Collection import audit create failed', {
          error,
          teamId,
          auditTaskId: resolvedAuditTaskId
        });
      });
  }

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
          auditTaskId: resolvedAuditTaskId,
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
          auditTaskId: resolvedAuditTaskId,
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

  const result = await (session ? fn(session) : mongoSessionRun(fn)).catch(async (error) => {
    if (auditCreated) {
      // 审计收口失败不能掩盖真实的业务异常，否则调用方拿到的是审计错误
      await failAuditLogByTaskId({
        teamId,
        taskId: resolvedAuditTaskId!,
        scope: 'member',
        event: AuditEventEnum.IMPORT_DATASET_CONTENT,
        failureReason: getErrText(error)
      }).catch((auditError) => {
        logger.warn('Collection import audit failure update failed', {
          error: auditError,
          teamId,
          auditTaskId: resolvedAuditTaskId
        });
      });
    }
    throw error;
  });

  if (auditCreated) {
    // 集合和训练数据此时已提交，回填真实 collectionId；审计写入失败不能让已成功的接口返回 500
    await updateAuditLogByTaskId({
      teamId,
      taskId: resolvedAuditTaskId!,
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      result: 'processing',
      metadata: {
        details: [
          {
            resourceId: result.collectionId,
            resourceName: createCollectionParams.name,
            resourceType: 'collection',
            sourceType: auditSource,
            sourceName: createCollectionParams.name,
            action: 'import',
            result: 'processing',
            processingParams: {
              trainingType,
              chunkSize: formatCreateCollectionParams.chunkSize ?? '',
              indexSize: formatCreateCollectionParams.indexSize ?? ''
            }
          }
        ]
      }
    }).catch((error) => {
      logger.warn('Collection import audit update failed', {
        error,
        teamId,
        auditTaskId: resolvedAuditTaskId
      });
    });
    await refreshTrainingAuditTask(resolvedAuditTaskId!);
  }

  return result;
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
    session
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
    { session, ordered: true }
  );

  if (isS3ObjectKey(fileId, 'dataset')) {
    await removeS3TTL({ key: fileId, bucketName: 'private', session });
  }

  return collection;
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

    // delete s3 images which are uploaded by users
    await s3DatasetSource.deleteDatasetFilesByKeys(imageIds);
  });
}
