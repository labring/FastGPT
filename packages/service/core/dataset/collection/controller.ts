import { assertParentPlanAcyclic } from '../../../common/parentFolder/parentPlan';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionSchemaType,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { predictDataLimitLength } from '../../../../global/core/dataset/utils';
import { delImgByRelatedId } from '../../../common/file/image/controller';
import { Types } from '../../../common/mongo';
import type { ClientSession } from '../../../common/mongo';
import { getLogger, LogCategories } from '../../../common/logger';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { deleteDatasetDataVector } from '../../../common/vectorDB/controller';
import { checkDatasetIndexLimit } from '../../../support/permission/teamLimit';
import { createTrainingUsage } from '../../../support/wallet/usage/controller';
import { getTeamModelHandle } from '../../ai/model/catalog/service';
import { MongoDatasetData } from '../data/schema';
import { getDatasetModelReference } from '../model';
import { rawText2Chunks } from '../read';
import { MongoDatasetTraining } from '../training/schema';
import { MongoDatasetCollection } from './schema';
import { createOrGetCollectionTags } from './utils';

import { hashStr } from '@fastgpt/global/common/string/tools';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  computedCollectionChunkSettings,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import type {
  ApiCreateDatasetCollectionParams,
  CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { isAuthorizedDatasetFileS3Key } from '../../../common/s3/sources/dataset/key';
import { isS3ObjectKey, removeS3TTL } from '../../../common/s3/utils';
import {
  createCollectionPermissionsBatch,
  deleteCollectionPermissions,
  moveCollectionPermissionsBatch,
  syncMovedCollectionPermissionDescendants
} from '../../../support/permission/collection/controller';
import { getFullTextStore } from '../data/textStore';
import {
  preCreateDatasetDataAndPushToTrainingQueue,
  pushDataListToTrainingQueue,
  pushDatasetToParseQueue
} from '../training/controller';
import { getDatasetImageIndexCapability } from '../utils';
import { getTrainingModeByCollection } from './utils';

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
  metadata?: Record<string, unknown>;
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
        await createCollections({
          collections: batch.map((doc) => ({
            ...doc,
            teamId,
            tmbId,
            datasetId,
            parentId: doc.parentId ? String(doc.parentId) : null,
            apiFileParentId: doc.apiFileParentId ?? undefined
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
  parentId: Types.ObjectId | null;
  /** server 侧父节点 id；挂到知识库根时是根哨兵 id 或 null */
  apiFileParentId: string | null;
};

/** 批量校正已存在节点的层级；根节点清除远端父字段，重复执行幂等。不抛异常。 */
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
            $set: {
              parentId: item.parentId ? String(item.parentId) : null,
              ...(item.apiFileParentId != null ? { apiFileParentId: item.apiFileParentId } : {})
            },
            // 远端根节点没有父级；清除旧字段，避免存入接口 schema 不接受的 null。
            ...(item.apiFileParentId == null ? { $unset: { apiFileParentId: 1 } } : {})
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
  /** 变更后的父级 collection _id；null = dataset 根 */
  newParentId: Types.ObjectId | null;
  /** server 侧父节点 id */
  apiFileParentId: string | null;
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

  // 树结构校验独立于 ACL，按知识库隔离读取涉及的祖先；关闭态和独立态也不能成环。
  const byDataset = new Map<string, BulkMoveCollectionParentItem[]>();
  for (const item of items) {
    const list = byDataset.get(item.datasetId) ?? [];
    list.push(item);
    byDataset.set(item.datasetId, list);
  }
  for (const [datasetId, updates] of byDataset) {
    await assertParentPlanAcyclic({
      changes: updates.map((item) => ({
        id: item._id,
        parentId: item.newParentId ? String(item.newParentId) : null
      })),
      loadParents: async (ids) => {
        const parents = await MongoDatasetCollection.find(
          { teamId, datasetId, _id: { $in: ids } },
          '_id parentId'
        )
          .session(session)
          .lean();
        return parents.map((item) => ({
          id: String(item._id),
          parentId: item.parentId ? String(item.parentId) : null
        }));
      }
    });
  }

  // 计划可能在拉取远端树、鉴权或事务重试期间失效；先核对真实源状态，不能按旧父级剥离新 ACL。
  for (const [datasetId, updates] of byDataset) {
    for (let offset = 0; offset < updates.length; offset += 1000) {
      const batch = updates.slice(offset, offset + 1000);
      const sources = await MongoDatasetCollection.find(
        { teamId, datasetId, _id: { $in: batch.map((item) => item._id) } },
        '_id parentId type inheritPermission'
      )
        .session(session)
        .lean();
      const byId = new Map(sources.map((item) => [String(item._id), item]));
      if (
        batch.some((item) => {
          const source = byId.get(item._id);
          return (
            !source ||
            (source.parentId ? String(source.parentId) : null) !== item.oldParentId ||
            source.type !== item.type ||
            (source.inheritPermission !== false) !== (item.inheritPermission !== false)
          );
        })
      ) {
        throw new UserError('Collection parent plan has changed', '文件位置或权限已变更，请重试');
      }
    }
  }

  // 第一阶段：parentId 仍是旧值，因此 ACL 可以从旧父级剥离继承位；函数同时按新拓扑算出移动节点的新快照。
  const movedFolders = await moveCollectionPermissionsBatch({
    teamId,
    items: items.map((item) => ({
      collectionId: item._id,
      datasetId: item.datasetId,
      oldParentId: item.oldParentId,
      newParentId: item.newParentId ? String(item.newParentId) : null,
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
  const modelHandle = await getTeamModelHandle({ teamId: String(dataset.teamId) });
  const agentModelData = modelHandle.getModelData(getDatasetModelReference(dataset, 'agent'), {
    type: 'llm'
  });
  const embeddingModelData = modelHandle.getModelData(
    getDatasetModelReference(dataset, 'embedding'),
    { type: 'embedding' }
  );
  const vlmModelData = modelHandle.getModelData(getDatasetModelReference(dataset, 'vlm'), {
    type: 'llm',
    vision: true,
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
      if (imageIds) {
        // 图片先落库为 indexing 数据，再由 ImageParse/向量处理接力更新同一条数据。
        return preCreateDatasetDataAndPushToTrainingQueue({
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
      }
      if (rawText) {
        const formattedData = chunks.map((item, index) => ({
          ...item,
          indexes: item.indexes?.map((text) => ({
            type: DatasetDataIndexTypeEnum.custom,
            text
          })),
          chunkIndex: index
        }));

        // QA 模式在生成前不预落库，由 downstream generateQA 拆分叶子分块后批量落库
        if (trainingMode === TrainingModeEnum.qa) {
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
            data: formattedData,
            session
          });
        }

        // rawText（手动输入文本、备份、模板、集合同步等）均先落库为 indexing 数据，再派发索引任务
        return preCreateDatasetDataAndPushToTrainingQueue({
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
          data: formattedData,
          session
        });
      }
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
/**
 * 批量创建集合，统一标签解析、文档构造、文件 TTL 和 ACL 初始化。
 * 同一团队/知识库/标签组合只解析一次；父目录须已完成创建，目录树由上层按层提交。
 * 单条与批量均使用此入口；集合、ACL 和文件状态共享事务，任一失败整体回滚。
 */
export async function createCollections({
  collections,
  session
}: {
  collections: (Omit<CreateOneCollectionParams, 'session'> & {
    _id?: Types.ObjectId;
    /** 可信内部兼容转换：复用同位置旧节点，或其目录内正文的 owner 与完整权限。 */
    permissionSourceCollectionId?: string;
  })[];
  session?: ClientSession;
}) {
  if (collections.length === 0) return [];

  const fn = async (s: ClientSession) => {
    // 权限复用必须读取本事务的真实来源；不能把请求或规划时的 ACL 快照直接写给新集合。
    const permissionSourceIds = [
      ...new Set(
        collections.flatMap((item) =>
          item.permissionSourceCollectionId ? [item.permissionSourceCollectionId] : []
        )
      )
    ];
    const sources = new Map<string, DatasetCollectionSchemaType>();
    for (let offset = 0; offset < permissionSourceIds.length; offset += 1000) {
      const rows = await MongoDatasetCollection.find(
        { _id: { $in: permissionSourceIds.slice(offset, offset + 1000) } },
        '_id teamId datasetId tmbId parentId type inheritPermission'
      )
        .session(s)
        .lean();
      for (const row of rows) sources.set(String(row._id), row);
    }
    const permissionSourceById = new Map<string, string>();

    // 1. 标签可能新增文档，必须在当前事务内解析，不能随模型参数提前计算。
    const tagsByKey = new Map<string, Awaited<ReturnType<typeof createOrGetCollectionTags>>>();
    const docs: (Omit<CreateOneCollectionParams, 'session' | 'parentId' | 'tags'> & {
      _id: Types.ObjectId;
      parentId: string | null;
      tags: Awaited<ReturnType<typeof createOrGetCollectionTags>> | undefined;
    })[] = [];
    for (const { permissionSourceCollectionId, ...props } of collections) {
      const source = permissionSourceCollectionId
        ? sources.get(permissionSourceCollectionId)
        : undefined;
      const insideSource = source && String(source._id) === String(props.parentId ?? '');
      if (
        permissionSourceCollectionId &&
        (!source ||
          String(source.teamId) !== String(props.teamId) ||
          String(source.datasetId) !== String(props.datasetId) ||
          (insideSource && source.type !== DatasetCollectionTypeEnum.folder) ||
          (!insideSource && String(source.parentId ?? '') !== String(props.parentId ?? '')))
      ) {
        throw new UserError(
          'Collection permission source has changed',
          '文件位置或权限已变更，请重试'
        );
      }
      const key = JSON.stringify([props.teamId, props.datasetId, props.tags]);
      if (!tagsByKey.has(key)) {
        tagsByKey.set(
          key,
          await createOrGetCollectionTags({
            tags: props.tags,
            teamId: props.teamId,
            datasetId: props.datasetId,
            session: s
          })
        );
      }
      const id = props._id ?? new Types.ObjectId();
      if (permissionSourceCollectionId)
        permissionSourceById.set(String(id), permissionSourceCollectionId);
      docs.push({
        ...props,
        _id: id,
        ...(source
          ? {
              tmbId: String(source.tmbId),
              inheritPermission: insideSource ? true : source.inheritPermission
            }
          : {}),
        parentId: props.parentId ? String(props.parentId) : null,
        tags: tagsByKey.get(key)
      });
    }

    // 同批目录尚无父级快照，必须由调用方按层建树，不能把子级快照误算成仅 owner。
    const newIds = new Set(docs.map((doc) => String(doc._id)));
    if (docs.some((doc) => doc.parentId && newIds.has(String(doc.parentId)))) {
      throw new Error('Collection batch parents must already exist');
    }

    // 2. 创建集合并按父级去重初始化快照。关闭态不需要 collection ACL；独立态仍须拒绝。
    const created = await MongoDatasetCollection.insertMany(docs, { session: s, ordered: true });
    const byTeam = new Map<string, typeof docs>();
    for (const doc of docs) {
      const items = byTeam.get(doc.teamId) ?? [];
      items.push(doc);
      byTeam.set(doc.teamId, items);
    }
    for (const [teamId, items] of byTeam) {
      await createCollectionPermissionsBatch({
        teamId,
        resources: items.map((doc) => ({
          collectionId: String(doc._id),
          datasetId: doc.datasetId,
          parentId: doc.parentId,
          tmbId: doc.tmbId,
          inheritPermission: doc.inheritPermission,
          permissionSourceCollectionId: permissionSourceById.get(String(doc._id))
        })),
        session: s
      });
    }

    // 3. 自有文件才去掉 TTL；按 key 去重，集合与文件状态必须一起提交。
    const fileKeys = new Set<string>();
    for (const { fileId, datasetId } of docs) {
      if (
        isS3ObjectKey(fileId, 'dataset') &&
        isAuthorizedDatasetFileS3Key({ key: fileId, datasetId }) &&
        !fileKeys.has(fileId)
      ) {
        await removeS3TTL({ key: fileId, bucketName: 'private', session: s });
        fileKeys.add(fileId);
      }
    }
    return created;
  };

  return session ? fn(session) : mongoSessionRun(fn);
}

/** 单条创建复用批量持久化，返回原有集合文档；外部传入的 _id 不得用于普通创建。 */
export async function createOneCollection({ session, ...props }: CreateOneCollectionParams) {
  const [collection] = await createCollections({
    collections: [{ ...props, _id: undefined }],
    session
  });
  return collection;
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
  /** 旧目录兼容转换时保留原 owner 与 ACL；外部 API 不开放此字段。 */
  permissionSourceCollectionId?: string;
};

/**
 * 批量创建进入解析队列的 API 文件；模型参数只计算一次，集合、ACL 和队列批量写入。
 * 首次导入默认整批共用账单；同步通过 perFile 保留逐文件账单，且可保留原额度估算。
 * 全部写入共享事务，任一失败整体回滚；文件正文由解析队列处理，不在这里切块。
 */
export const createApiFileCollectionsBatch = async ({
  dataset,
  files,
  createCollectionParams,
  billing = { mode: 'shared' },
  indexLimitEstimate,
  session
}: {
  dataset: DatasetSchemaType;
  files: CreateApiFileCollectionItem[];
  /** 逐文件身份、位置和继承设置由 files 提供，不得被请求公共参数覆盖。 */
  createCollectionParams: Omit<
    CreateOneCollectionParams,
    'name' | 'apiFileId' | 'apiFileParentId' | 'parentId' | 'session' | 'inheritPermission'
  >;
  billing?: { mode: 'shared'; billId?: string } | { mode: 'perFile' };
  /** 缺省按文件数预估；同步的旧解析路径没有已知分块，传 0 保留其原估算契约。 */
  indexLimitEstimate?: number;
  session?: ClientSession;
}): Promise<{ collectionIds: string[] }> => {
  if (files.length === 0) return { collectionIds: [] };

  // 1. 模型和训练参数整批计算；额度估算由上层业务策略决定。
  const {
    agentModelData,
    embeddingModelData,
    vlmModelData,
    formatCreateCollectionParams,
    trainingType
  } = await formatCollectionParamsByDataset({ dataset, createCollectionParams });
  const teamId = formatCreateCollectionParams.teamId;
  const tmbId = formatCreateCollectionParams.tmbId;
  await checkDatasetIndexLimit({ teamId, insertLen: indexLimitEstimate ?? files.length });

  const create = async (s: ClientSession) => {
    // 2. 复用通用持久化：标签、字段与 ACL 初始化不再维护单独的 API 文件实现。
    const collections = await createCollections({
      collections: files.map((file) => ({
        ...formatCreateCollectionParams,
        name: file.name,
        type: DatasetCollectionTypeEnum.apiFile,
        datasetId: String(dataset._id),
        parentId: file.parentId,
        apiFileId: file.apiFileId,
        apiFileParentId: file.apiFileParentId,
        inheritPermission: file.inheritPermission,
        permissionSourceCollectionId: file.permissionSourceCollectionId,
        metadata: file.metadata,
        trainingType,
        chunkSize: formatCreateCollectionParams.chunkSize,
        indexSize: formatCreateCollectionParams.indexSize,
        hashRawText: undefined,
        rawTextLength: undefined
      })),
      session: s
    });

    // 3. 账单归属独立于批量写入：同步仍是一文件一账单，首次导入可整批共用。
    const createBill = async (appName: string) =>
      (
        await createTrainingUsage({
          teamId,
          tmbId,
          appName,
          billSource: UsageSourceEnum.training,
          vectorModelId: embeddingModelData.modelId!,
          agentModelId: agentModelData.modelId,
          vllmModelId: vlmModelData?.modelId,
          session: s
        })
      ).usageId;
    const billIds = await (async () => {
      if (billing.mode === 'shared') {
        const billId =
          billing.billId ??
          (await createBill(
            files.length > 1 ? `${files[0].name} +${files.length - 1}` : files[0].name
          ));
        return files.map(() => billId);
      }
      // 保留既有账单条数与名称；同一 Mongo 事务内顺序执行写入。
      const ids: string[] = [];
      for (const file of files) ids.push(await createBill(file.name));
      return ids;
    })();

    // 4. 即使逐文件账单不同，解析队列仍可一次写入，避免逐文件往返数据库。
    const collectionIds = collections.map((collection) => String(collection._id));
    await pushDatasetToParseQueue({
      teamId,
      tmbId,
      datasetId: String(dataset._id),
      items: collectionIds.map((collectionId, index) => ({ collectionId, billId: billIds[index] })),
      session: s
    });
    return { collectionIds };
  };
  return session ? create(session) : mongoSessionRun(create);
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
 * 删除集合及关联数据：Mongo 分块、任务、全文和 ACL 必须随调用方事务一起提交或回滚。
 * 同一 session 的数据库操作顺序执行；事务内失败交给外层重试整段回调，不能在已中止事务中局部重试。
 * 向量与对象存储仍沿用现有外部清理行为，不属于 Mongo 事务。
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
    { imageId: 1, datasetId: 1 }
  ).lean();
  // 只删除归属于该图片集合 dataset 的 key，避免脏数据里的外库 key 被跨库物理删除。
  const imageIds = imageDatas
    .filter(
      (item) =>
        !!item.imageId &&
        isAuthorizedDatasetFileS3Key({
          key: item.imageId,
          datasetId: String(item.datasetId)
        })
    )
    .map((item) => item.imageId!);

  const remove = async () => {
    // 同一 session 不并行发起 Mongo 写入；重建失败时旧分块和旧任务必须随集合一起恢复。
    await MongoDatasetTraining.deleteMany(
      { teamId, datasetId: { $in: datasetIds }, collectionId: { $in: collectionIds } },
      { session }
    );
    await getFullTextStore().deleteByCollectionIds({ teamId, datasetIds, collectionIds }, session);
    await MongoDatasetData.deleteMany(
      { teamId, datasetId: { $in: datasetIds }, collectionId: { $in: collectionIds } },
      { session }
    );

    await Promise.all([
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
              // 同样只删除归属于各自 dataset 的 fileId，避免误删外库文件。
              collections
                .filter(
                  (item) =>
                    !!item.fileId &&
                    isAuthorizedDatasetFileS3Key({
                      key: item.fileId,
                      datasetId: String(item.datasetId)
                    })
                )
                .map((item) => item.fileId!)
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
  };

  if (session?.inTransaction()) await remove();
  else await retryFn(remove);
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
