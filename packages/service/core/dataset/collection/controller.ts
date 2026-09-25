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
import { Types } from '../../../common/mongo';
import type { ClientSession } from '../../../common/mongo';
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
  createCollectionPermissionsBatch,
  deleteCollectionPermissions,
  moveCollectionPermissionsBatch,
  syncMovedCollectionPermissionDescendants
} from '../../../support/permission/collection/controller';
import type {
  CreateCollectionWithResultResponseType,
  ApiCreateDatasetCollectionParams
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

const logger = getLogger(LogCategories.MODULE.DATASET);

/** folder 骨架按层 insertMany 的批大小 */
export const API_FILE_FOLDER_BATCH_SIZE = 500;
/** 自动同步补建 file 时单个事务覆盖的节点数上限；首次导入不使用该值分批 */
export const API_FILE_FILE_BATCH_SIZE = 200;
/**
 * API 文件批量写入事务的提交时长上限。
 * 创建接口刻意让本轮全部 file 共用一个事务，以保证调用方只会观察到「全部提交」或「全部回滚」。
 * 目标部署的 MongoDB 事务配置已经用 10 万条完整数据验证；这里不再按该常量拆分创建批次。
 * `maxCommitTimeMS` 只控制提交阶段，不会修改服务端 `transactionLifetimeLimitSeconds`，部署时需保持
 * 与 10 万条压测环境一致的事务生命周期配置。
 * 须明显小于调用方的 HTTP 超时，否则客户端先断连、服务端事务仍会提交。
 */
export const API_FILE_FILE_COMMIT_TIMEOUT_MS = 5 * 60 * 1000;

export type BulkInsertCollectionDoc = {
  /** 调用方预生成的 ObjectId，以便同轮后续节点直接引用 */
  _id: Types.ObjectId;
  name: string;
  type: DatasetCollectionTypeEnum;
  apiFileId: string;
  apiFileParentId?: string | null;
  parentId: Types.ObjectId | null;
  /**
   * 缺省 = 继承父级（与 schema default 一致）。必须与同一轮 file 的取值一致，
   * 否则一次导入里目录与文件权限口径不同：目录名与层级会按继承态外泄
   */
  inheritPermission?: boolean;
};

/**
 * 分批 insertMany 建 **folder** 骨架。
 * 只适用于 folder：folder 无关联账单/队列，可容忍批级部分失败；file 走 createApiFileCollectionsBatch（全事务）。
 * 每批（insertMany + ACL 初始化）在**同一事务**内：ACL 行与 collection 必须同时落库，
 * 否则启用态下会出现「有目录但没有任何权限行」的不可见节点。
 * 批失败时按 _id 回查实际落库情况：事务失败即整批未落库，回查主要作为兜底与观测。
 */
export const bulkInsertFolderCollections = async ({
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
      await mongoSessionRun(async (session) => {
        // 不写 tags：folder 沿用旧行为不带标签（走 createOneCollection 的旧代码也没传），schema default 为 []
        await MongoDatasetCollection.insertMany(
          batch.map((doc) => ({
            ...doc,
            teamId,
            tmbId,
            datasetId
          })),
          { ordered: false, session }
        );

        await createCollectionPermissionsBatch({
          teamId,
          resources: batch.map((doc) => ({
            collectionId: String(doc._id),
            datasetId,
            parentId: doc.parentId ? String(doc.parentId) : null,
            tmbId,
            inheritPermission: doc.inheritPermission
          })),
          session
        });
      });
      successApiFileIds.push(...batch.map((doc) => doc.apiFileId));
    } catch (error) {
      try {
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
      } catch (recoveryError) {
        // 回查自身也会失败（如 DB 不可达），此时无法判定落库情况，整批按失败上报
        logger.warn('Bulk insert folder batch failed and recovery query failed', {
          teamId,
          datasetId,
          batchSize: batch.length,
          error,
          recoveryError
        });
        failedApiFileIds.push(...batch.map((doc) => doc.apiFileId));
      }
    }
  }

  return { successApiFileIds, failedApiFileIds };
};

export type BulkUpdateCollectionParentItem = {
  _id: string;
  parentId: Types.ObjectId;
  /** server 侧父节点 id；挂到知识库根时是根哨兵 id，不会为空 */
  apiFileParentId: string;
};

/** 批量校正已存在节点的层级；按目标值直接 $set，重复执行天然幂等。不抛异常。 */
export const bulkUpdateCollectionsParent = async ({
  teamId,
  updates,
  session
}: {
  teamId: string;
  updates: BulkUpdateCollectionParentItem[];
  /** 与 ACL 迁移同事务时传入，避免 parentId 与权限快照各自成功 */
  session?: ClientSession;
}): Promise<{
  successIds: string[];
  failedIds: string[];
  /**
   * 实际命中（filter 匹配到文档）的 op 数。可能小于 updates.length：目标行在调用前被删/重建过。
   * 这种「命中 0 条」不会进 failedIds（驱动不报错），调用方需自行比对并告警。
   */
  matchedCount: number;
}> => {
  const successIds: string[] = [];
  const failedIds: string[] = [];
  if (updates.length === 0) return { successIds, failedIds, matchedCount: 0 };

  let matchedCount = 0;
  try {
    // 已 resolve 的 BulkWriteResult 不含 writeErrors；mongoose 只在 mongoose.results[i] 标记未执行的 op（cast/校验失败），成功为 null
    const result: {
      matchedCount?: number;
      mongoose?: { validationErrors?: Error[]; results?: Array<unknown | null> };
    } = await MongoDatasetCollection.bulkWrite(
      updates.map((item) => ({
        updateOne: {
          filter: { _id: item._id, teamId },
          update: {
            // 模型类型侧 parentId 是 string（global DatasetCollectionSchemaType.ParentIdSchema），mongoose schema 侧是 Schema.Types.ObjectId，传 hex 串由驱动转回 ObjectId
            $set: { parentId: String(item.parentId), apiFileParentId: item.apiFileParentId }
          }
        }
      })),
      { ordered: false, ...(session ? { session } : {}) }
    );
    matchedCount = result.matchedCount ?? 0;

    updates.forEach((item, index) => {
      if (result.mongoose?.results?.[index]) failedIds.push(item._id);
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

  return { successIds, failedIds, matchedCount };
};

export type BulkMoveCollectionParentItem = {
  /** collection _id，同时也是 ACL 的 resourceId */
  _id: string;
  datasetId: string;
  type: DatasetCollectionTypeEnum;
  inheritPermission?: boolean;
  /** 变更前的父级 collection _id；null = dataset 根 */
  oldParentId: string | null;
  /** 变更后的父级 collection _id */
  newParentId: Types.ObjectId;
  /** server 侧父节点 id；挂到知识库根时是根哨兵 id，不会为空 */
  apiFileParentId: string;
};

/**
 * 批量校正父级 = ACL 迁移 + parentId 写入。
 *
 * 两者必须在同一事务内：ACL 要读**变更前**的父级才能剥离旧继承位，所以它先于 parentId 写入；
 * 只剩一半会留下「快照按新父级算、parentId 仍是旧父级」的错位节点。
 * 调用方负责开事务（`mongoSessionRun`）。
 */
export const bulkMoveCollectionsParent = async ({
  teamId,
  items,
  session
}: {
  teamId: string;
  items: BulkMoveCollectionParentItem[];
  session: ClientSession;
}) => {
  if (items.length === 0) return { successIds: [], failedIds: [], matchedCount: 0 };

  // 第一阶段：parentId 仍是旧值，因此 ACL 可以从旧父级剥离继承位；函数同时按新拓扑算出移动节点的新快照。
  const movedFolders = await moveCollectionPermissionsBatch({
    teamId,
    items: items.map((item) => ({
      collectionId: item._id,
      datasetId: item.datasetId,
      oldParentId: item.oldParentId,
      newParentId: String(item.newParentId),
      type: item.type,
      inheritPermission: item.inheritPermission
    })),
    session
  });

  // 第二阶段：所有节点的 parentId 一次性写入。失败必须抛错，让第一阶段的 ACL 写入同事务回滚。
  const result = await bulkUpdateCollectionsParent({
    teamId,
    updates: items.map((item) => ({
      _id: item._id,
      parentId: item.newParentId,
      apiFileParentId: item.apiFileParentId
    })),
    session
  });

  // bulkUpdateCollectionsParent 为兼容独立调用会把写入异常转换成结果；组合迁移不能沿用该语义，
  // 否则 ACL 已按新父级重算、parentId 却仍是旧值。这里抛错交给外层事务整体回滚。
  if (result.failedIds.length > 0 || result.matchedCount !== items.length) {
    throw new Error(
      `Bulk move collection parent failed: expected=${items.length}, matched=${result.matchedCount}, failed=${result.failedIds.length}`
    );
  }

  // 第三阶段：此时递归读取的是新树；同批迁移节点在第一阶段已各自处理，必须作为递归停止点。
  await syncMovedCollectionPermissionDescendants({
    teamId,
    folders: movedFolders,
    movedCollectionIds: new Set(items.map((item) => item._id)),
    session
  });

  return result;
};

/**
 * 解析模型数据 + 计算 chunk 设置 + 清理与 trainingType 互斥的字段。
 * 批量创建时整批复用同一份结果，避免逐文件重复计算。
 * 导出供单测直接断言计算结果（避免测试复制一份计算逻辑当断言基准）。
 */
export const formatCollectionParamsByDataset = async ({
  dataset,
  createCollectionParams
}: {
  dataset: DatasetSchemaType;
  /** name 不是公共参数（逐文件不同），故此处不要求 */
  createCollectionParams: Omit<CreateOneCollectionParams, 'name' | 'session'>;
}) => {
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

  return {
    agentModelData,
    embeddingModelData,
    vlmModelData,
    formatCreateCollectionParams,
    trainingType,
    trainingMode
  };
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
  const {
    agentModelData,
    embeddingModelData,
    vlmModelData,
    formatCreateCollectionParams,
    trainingType,
    trainingMode
  } = await formatCollectionParamsByDataset({ dataset, createCollectionParams });

  const teamId = formatCreateCollectionParams.teamId;
  const tmbId = formatCreateCollectionParams.tmbId;

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
      // name 不参与公共参数计算（批量路径下逐文件不同），此处补回
      name: createCollectionParams.name,
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
        appName: createCollectionParams.name,
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

export type CreateApiFileCollectionItem = {
  name: string;
  apiFileId: string;
  /**
   * server 侧父节点 id；带子文档的 file 与不带子文档的同级文件取值相同。
   * 调用方须先归一：无 server 父级时不传（而不是传 null），与 createOneCollection 的落库形态一致，
   * 否则同一知识库里会出现「null」与「缺字段」两种形态
   */
  apiFileParentId?: string;
  /** 本地父目录 collection _id；调用方已解析好，缺省表示落在 dataset 根 */
  parentId?: string;
  /**
   * 缺省 = 继承父级。**逐文件**取值，不取请求级：一次导入里只有用户显式选中的节点
   * 该落独立态，展开出的后代必须保持继承，否则 4w 节点各自维护 ACL 且互不传播
   */
  inheritPermission?: boolean;
  metadata?: Record<string, any>;
};

/**
 * 批量创建 apiFile 类型 collection：模型/chunk 设置整批算一次、训练账单建一次、
 * 解析队列插一次、collection 一次 insertMany。
 *
 * 全部写入共用调用方传入的 session：任一失败整批回滚，调用方按「整批失败」计数 ——
 * 不做部分成功，避免超时后无法判断哪些文件已落库。
 * 仅适用于走解析队列的路径（无 rawText/imageIds），与 createCollectionAndInsertData 的该分支等价。
 */
export const createApiFileCollectionsBatch = async ({
  dataset,
  files,
  createCollectionParams,
  session
}: {
  dataset: DatasetSchemaType;
  files: CreateApiFileCollectionItem[];
  /** inheritPermission 逐文件取自 files：不在此处接收，避免整批被同一个请求级值覆盖 */
  createCollectionParams: Omit<
    CreateOneCollectionParams,
    'name' | 'apiFileId' | 'apiFileParentId' | 'parentId' | 'session' | 'inheritPermission'
  >;
  session: ClientSession;
}): Promise<{ collectionIds: string[] }> => {
  if (files.length === 0) return { collectionIds: [] };

  const {
    agentModelData,
    embeddingModelData,
    vlmModelData,
    formatCreateCollectionParams,
    trainingType
  } = await formatCollectionParamsByDataset({ dataset, createCollectionParams });

  const teamId = formatCreateCollectionParams.teamId;
  const tmbId = formatCreateCollectionParams.tmbId;

  // tags 是请求级参数，整批相同：解析一次即可，避免逐文件重复创建标签文档
  const collectionTags = await createOrGetCollectionTags({
    tags: formatCreateCollectionParams.tags,
    teamId,
    datasetId: String(dataset._id),
    session
  });

  // 解析队列路径不在此处切块（切块在 datasetParse 里按 collection 的 chunkSize 做），
  // 但**必须把计算好的 chunkSize / indexSize 落库**：collection 是这两个值的唯一载体，
  // 置空会让解析阶段回退到 rawText2Chunks 的默认 512、向量阶段回退到模型最大索引长度，
  // 而不是本次请求算出来的自动值（chunkAutoChunkSize = 1000）。
  const chunkSize = formatCreateCollectionParams.chunkSize;
  const indexSize = formatCreateCollectionParams.indexSize;

  // 配额检查一次覆盖整批：解析队列路径尚无 chunk，predictDataLimitLength 恒为 0，
  // 用「待创建 collection 数」近似预测增量 —— 每个文件最终至少产生 1 个索引，逐文件检查等价但要多 4w 次查询。
  // 放在写入之前：超限直接抛出，事务整体回滚，调用方按「整批失败」计数
  await checkDatasetIndexLimit({
    teamId,
    insertLen: files.length
  });

  // 整个请求共用一份训练账单：appName 取首个文件名，其余数量收敛为后缀
  const { usageId: billId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: files.length > 1 ? `${files[0].name} +${files.length - 1}` : files[0].name,
    billSource: UsageSourceEnum.training,
    vectorModelId: embeddingModelData.modelId!,
    agentModelId: agentModelData.modelId,
    vllmModelId: vlmModelData?.modelId,
    session
  });

  // 预生成 _id：解析队列行要引用 collectionId，必须在 insertMany 之前就确定
  const objectIds = files.map(() => new Types.ObjectId());

  await MongoDatasetCollection.insertMany(
    files.map((file, index) => ({
      ...formatCreateCollectionParams,
      _id: objectIds[index],
      // 逐文件字段必须写在 ...formatCreateCollectionParams 之后，覆盖请求级同名字段
      name: file.name,
      type: DatasetCollectionTypeEnum.apiFile,
      datasetId: String(dataset._id),
      parentId: file.parentId ?? null,
      apiFileId: file.apiFileId,
      apiFileParentId: file.apiFileParentId,
      // 逐文件字段必须写在 ...formatCreateCollectionParams 之后：请求级同名值不能覆盖它
      inheritPermission: file.inheritPermission,
      metadata: file.metadata,
      // 展开的 formatCreateCollectionParams 里是原始 tags，须用解析后的标签文档覆盖
      tags: collectionTags,
      trainingType,
      // 与 createCollectionAndInsertData 的无 rawText/imageIds 分支一致：
      // 有计算值就写计算值，只有没算出来时才是 undefined
      chunkSize,
      indexSize,
      hashRawText: undefined,
      rawTextLength: undefined
    })),
    { session, ordered: true }
  );

  // ACL 快照与 collection 同一事务：启用态下缺快照的 collection 对所有非 owner 不可见
  await createCollectionPermissionsBatch({
    teamId,
    resources: files.map((file, index) => ({
      collectionId: String(objectIds[index]),
      datasetId: String(dataset._id),
      parentId: file.parentId ?? null,
      tmbId,
      inheritPermission: file.inheritPermission
    })),
    session
  });

  await pushDatasetToParseQueue({
    teamId,
    tmbId,
    datasetId: String(dataset._id),
    collectionId: objectIds.map((id) => String(id)),
    billId,
    session
  });

  return { collectionIds: objectIds.map((id) => String(id)) };
};

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
