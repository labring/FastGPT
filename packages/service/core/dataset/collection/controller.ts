import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from './schema';
import type {
  DatasetCollectionSchemaType,
  DatasetSchemaType,
  TableSchemaType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '../training/schema';
import { MongoDatasetData } from '../data/schema';
import { delImgByRelatedId } from '../../../common/file/image/controller';
import { deleteDatasetDataVector } from '../../../common/vectorDB/controller';
import type { ClientSession } from '../../../common/mongo';
import { createOrGetCollectionTags } from './utils';
import { rawText2Chunks } from '../read';
import {
  parseDatasetBackupFromFileViaWorker,
  countDatasetBackupFromFileViaWorker
} from '../../../worker/function';
import { checkDatasetIndexLimit } from '../../../support/permission/teamLimit';
import { predictDataLimitLength } from '../../../../global/core/dataset/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { createTrainingUsage } from '../../../support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  getLLMModelById,
  getEmbeddingModelById,
  getVlmModelById,
  getRerankModelById
} from '../../ai/model';
import { pushDataListToTrainingQueue, pushDatasetToParseQueue } from '../training/controller';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { MongoDatasetDataText } from '../data/dataTextSchema';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getTrainingModeByCollection } from './utils';
import {
  computedCollectionChunkSettings,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { removeS3TTL, isS3ObjectKey } from '../../../common/s3/utils';
import {
  DBDatasetVectorTableName,
  DBDatasetValueVectorTableName,
  DatasetVectorTableName
} from '../../../common/vectorDB/constants';
import { addLog } from '../../../common/system/log';
import type {
  CreateCollectionWithResultResponseType,
  ApiCreateDatasetCollectionParams
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import {
  PermissionEffectScopeEnum,
  OwnerRoleVal,
  ManageRoleVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '../schema';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { getResourceOwnedClbs } from '../../../support/permission/controller';
import { pickCollaboratorIdFields } from '../../../support/permission/utils';
import type { AnyBulkWriteOperation } from '../../../common/mongo';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import {
  syncCollaborators,
  syncChildrenPermission,
  replaceResourceClbs,
  type SyncChildrenPermissionResourceType
} from '../../../support/permission/inheritPermission';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { UserError } from '@fastgpt/global/common/error/utils';

/* find all collectionId by top collectionId */
export async function findCollectionAndAllChildren({
  teamId,
  collectionId,
  fields
}: {
  teamId: string;
  collectionId: string;
  fields?: string;
}): Promise<DatasetCollectionSchemaType[]> {
  const rootCollection = await MongoDatasetCollection.findById(collectionId, fields).lean();
  if (!rootCollection) {
    return Promise.reject(new UserError('Collection not found'));
  }

  const allCollections: DatasetCollectionSchemaType[] = [rootCollection];
  let currentQueue = [collectionId];

  // BFS：每层一次批量查询，复杂度从 O(N) 降为 O(depth)
  while (currentQueue.length > 0) {
    const children = await MongoDatasetCollection.find(
      { teamId, parentId: { $in: currentQueue } },
      fields
    ).lean();
    allCollections.push(...children);
    currentQueue = children.map((c) => String(c._id));
  }

  return allCollections;
}

export const createCollectionAndInsertData = async ({
  dataset,
  rawText,
  imageIds,
  createCollectionParams,
  backupParse = false,
  billId,
  session,
  filePath,
  fileExtension
}: {
  dataset: DatasetSchemaType;
  rawText?: string;
  imageIds?: string[];
  createCollectionParams: CreateOneCollectionParams;

  backupParse?: boolean;

  billId?: string;
  session?: ClientSession;
  filePath?: string;
  fileExtension?: string;
}): Promise<CreateCollectionWithResultResponseType> => {
  addLog.debug('[createCollectionAndInsertData] Input params', {
    rawTextLength: rawText?.length,
    imageIdsCount: imageIds?.length,
    collectionType: createCollectionParams.type
  });
  // Adapter 4.9.0
  if (createCollectionParams.trainingType === DatasetCollectionDataProcessModeEnum.auto) {
    createCollectionParams.trainingType = DatasetCollectionDataProcessModeEnum.chunk;
    createCollectionParams.autoIndexes = true;
  }

  const formatCreateCollectionParams = computedCollectionChunkSettings({
    ...createCollectionParams,
    llmModel: getLLMModelById(dataset.agentModelId),
    vectorModel: getEmbeddingModelById(dataset.vectorModelId)
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
    small2bigIndexes: formatCreateCollectionParams.small2bigIndexes
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
  }

  if (
    trainingType === DatasetCollectionDataProcessModeEnum.qa ||
    trainingType === DatasetCollectionDataProcessModeEnum.backup
  ) {
    delete formatCreateCollectionParams.autoIndexes;
    delete formatCreateCollectionParams.hypeIndexes;
    delete formatCreateCollectionParams.hypeIndexPrompt;
  }

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
  }

  if (trainingType === DatasetCollectionDataProcessModeEnum.backup) {
    delete formatCreateCollectionParams.indexSize;
  }
  if (trainingType !== DatasetCollectionDataProcessModeEnum.qa) {
    delete formatCreateCollectionParams.qaPrompt;
  }

  // 1. split chunks or create image chunks
  // 当 filePath 存在时，Worker 直接读文件解析，同时返回 hashRawText 和 rawTextLength
  let hashRawText: string | undefined;
  let rawTextLength: number | undefined;

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
      metadata?: Record<string, any>;
    }>;
    chunkSize?: number;
    indexSize?: number;
  } = await (async () => {
    // Worker 直接读文件统计行数：主线程零阻塞，同时获取 hash 和 length
    // 使用 countDatasetBackupFromFileViaWorker 替代 parseDatasetBackupFromFileViaWorker，
    // IPC 仅传回 {chunkCount, hashRawText, rawTextLength}，消除 200k 对象 structured clone 开销。
    if (backupParse && filePath && fileExtension) {
      const result = await countDatasetBackupFromFileViaWorker(filePath, fileExtension);
      hashRawText = result.hashRawText;
      rawTextLength = result.rawTextLength;
      return {
        chunks: Array(result.chunkCount).fill({}),
        chunkSize: formatCreateCollectionParams.chunkSize,
        indexSize: formatCreateCollectionParams.indexSize
      };
    }

    if (rawText) {
      // Process text chunks
      const chunks = await rawText2Chunks({
        rawText,
        chunkTriggerType: formatCreateCollectionParams.chunkTriggerType,
        chunkTriggerMinSize: formatCreateCollectionParams.chunkTriggerMinSize,
        chunkSize: formatCreateCollectionParams.chunkSize,
        paragraphChunkDeep: formatCreateCollectionParams.paragraphChunkDeep,
        paragraphChunkMinSize: formatCreateCollectionParams.paragraphChunkMinSize,
        maxSize: getLLMMaxChunkSize(getLLMModelById(dataset.agentModelId)),
        overlapRatio: trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
        customReg: formatCreateCollectionParams.chunkSplitter
          ? [formatCreateCollectionParams.chunkSplitter]
          : [],
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
    const isPermissionSyncDataset =
      dataset.type === DatasetTypeEnum.apiDataset &&
      !!(dataset.apiDatasetServer as any)?.apiServer?.permissionSync;

    const { _id: collectionId } = await createOneCollection({
      ...formatCreateCollectionParams,
      trainingType,
      chunkSize,
      indexSize,

      hashRawText: hashRawText || (rawText ? hashStr(rawText) : undefined),
      rawTextLength: rawTextLength ?? rawText?.length,
      skipPermissionCreate: isPermissionSyncDataset,
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
        vectorModelId: getEmbeddingModelById(dataset.vectorModelId)?.id,
        agentModelId: getLLMModelById(dataset.agentModelId)?.id,
        vllmModelId: getVlmModelById(dataset.vlmModelId)?.id,
        rerankModelId: getRerankModelById()?.id,
        session
      });
      return newUsageId;
    })();

    // 5. insert to training queue
    const insertResults = await (async () => {
      addLog.debug('[createCollectionAndInsertData] Checking training queue path', {
        hasRawText: !!rawText,
        hasImageIds: !!imageIds,
        chunksCount: chunks.length
      });

      if (rawText || imageIds) {
        addLog.debug('[createCollectionAndInsertData] Pushing to data training queue');
        return pushDataListToTrainingQueue({
          teamId,
          tmbId,
          datasetId: dataset._id,
          collectionId,
          agentModelId: dataset.agentModelId,
          vectorModelId: dataset.vectorModelId,
          vlmModelId: dataset.vlmModelId,
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
        addLog.debug('[createCollectionAndInsertData] Pushing to parse queue');
        const gpuParseExts = global.systemEnv?.gpuParseFileExtensions || ['.pdf'];
        const useGpuQueue = gpuParseExts.some((ext) =>
          (formatCreateCollectionParams.name || '').toLowerCase().endsWith(ext.toLowerCase())
        );
        await pushDatasetToParseQueue({
          teamId,
          tmbId,
          datasetId: dataset._id,
          collectionId,
          billId: traingUsageId,
          useGpuQueue,
          session
        });
        addLog.debug('[createCollectionAndInsertData] Successfully pushed to parse queue');
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
  fileMd5?: string;
  createTime?: Date;
  updateTime?: Date;
  tableSchema?: TableSchemaType;
  forbid?: boolean;
  session?: ClientSession;
  skipPermissionCreate?: boolean;
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
    apiFileParentId,
    tableSchema,
    forbid
  } = props;

  const collectionTags = await createOrGetCollectionTags({
    tags,
    teamId,
    datasetId,
    session
  });

  // Determine inheritPermission based on parent's permissionEffectScope
  let inheritPermission = true;
  if (parentId) {
    // Parent is a collection
    const parentCollection = await MongoDatasetCollection.findOne(
      { _id: parentId },
      'permissionEffectScope'
    )
      .lean()
      .session(session ?? null);
    if (parentCollection?.permissionEffectScope === PermissionEffectScopeEnum.currentOnly) {
      inheritPermission = false;
    }
  } else {
    // Parent is the dataset
    const parentDataset = await MongoDataset.findOne({ _id: datasetId }, 'permissionEffectScope')
      .lean()
      .session(session ?? null);
    if (parentDataset?.permissionEffectScope === PermissionEffectScopeEnum.currentOnly) {
      inheritPermission = false;
    }
  }

  // Create collection
  const [collection] = await MongoDatasetCollection.create(
    [
      {
        ...props,
        _id: undefined,

        parentId: parentId || null,

        tags: collectionTags,

        inheritPermission,

        ...(fileId ? { fileId } : {}),
        ...(rawLink ? { rawLink } : {}),
        ...(externalFileId ? { externalFileId } : {}),
        ...(externalFileUrl ? { externalFileUrl } : {}),
        ...(apiFileId ? { apiFileId } : {}),
        ...(apiFileParentId ? { apiFileParentId } : {}),
        ...(tableSchema ? { tableSchema } : {}),
        forbid: forbid ?? false
      }
    ],
    { session, ordered: true }
  );

  if (isS3ObjectKey(fileId, 'dataset')) {
    await removeS3TTL({ key: fileId, bucketName: 'private', session });
  }

  if (!props.skipPermissionCreate) {
    if (inheritPermission && props.type === DatasetCollectionTypeEnum.folder) {
      // folder 类型：继承父级协作者，并将创建者设为 owner
      // 父级可能是另一个 collection（有 parentId）或 dataset（无 parentId）
      const parentClbs = await getResourceOwnedClbs({
        resourceId: parentId || datasetId,
        resourceType: parentId ? PerResourceTypeEnum.collection : PerResourceTypeEnum.dataset,
        teamId,
        session
      });

      const collaborators = [
        ...parentClbs
          .filter((clb) => clb.tmbId !== props.tmbId)
          .map((clb) => {
            if (clb.permission === OwnerRoleVal) clb.permission = ManageRoleVal;
            return clb;
          }),
        { tmbId: props.tmbId, permission: OwnerRoleVal }
      ];

      const ops: AnyBulkWriteOperation<ResourcePermissionType>[] = collaborators.map((clb) => ({
        updateOne: {
          filter: {
            ...pickCollaboratorIdFields(clb),
            teamId,
            resourceId: collection._id,
            resourceType: PerResourceTypeEnum.collection
          },
          update: { $set: { permission: clb.permission } },
          upsert: true
        }
      }));

      await MongoResourcePermission.bulkWrite(ops, { session });
    } else {
      // 为创建者写入 owner 权限
      await MongoResourcePermission.create(
        [
          {
            teamId,
            tmbId: props.tmbId,
            resourceId: collection._id,
            permission: OwnerRoleVal,
            resourceType: PerResourceTypeEnum.collection
          }
        ],
        { session }
      );
    }
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
      // Delete dataset_data_texts
      MongoDatasetDataText.deleteMany({
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      }),
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
      deleteDatasetDataVector({
        teamId,
        datasetIds,
        collectionIds,
        tableName: DatasetVectorTableName
      }),
      deleteDatasetDataVector({
        teamId,
        datasetIds,
        collectionIds,
        tableName: DBDatasetVectorTableName
      }),
      deleteDatasetDataVector({
        teamId,
        datasetIds,
        collectionIds,
        tableName: DBDatasetValueVectorTableName
      })
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

/**
 * 同步 Dataset 权限到其下属所有根级 Folder Collection，并递归传播到子 Collection。
 * 在 Dataset 移动或协作者权限变更后调用。
 */
export async function syncDatasetFolderCollectionPermissions({
  datasetId,
  teamId,
  collaborators,
  session
}: {
  datasetId: string;
  teamId: string;
  collaborators: CollaboratorItemType[];
  session: ClientSession;
}) {
  const rootFolderCollections = await MongoDatasetCollection.find(
    {
      datasetId,
      type: DatasetCollectionTypeEnum.folder,
      parentId: null,
      inheritPermission: true
    },
    '_id type teamId parentId'
  )
    .lean<SyncChildrenPermissionResourceType[]>()
    .session(session);

  for (const folderCollection of rootFolderCollections) {
    await replaceResourceClbs({
      teamId,
      resourceId: String(folderCollection._id),
      resourceType: PerResourceTypeEnum.collection,
      collaborators,
      session
    });

    await syncChildrenPermission({
      resource: {
        _id: String(folderCollection._id),
        type: folderCollection.type,
        teamId,
        parentId: undefined
      },
      folderTypeList: [DatasetCollectionTypeEnum.folder],
      resourceType: PerResourceTypeEnum.collection,
      resourceModel: MongoDatasetCollection,
      collaborators,
      additionalFilter: { datasetId },
      session
    });
  }
}
