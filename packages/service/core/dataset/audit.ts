import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type {
  TeamAuditDetail,
  TeamAuditMetadataValue
} from '@fastgpt/global/support/user/audit/type';
import { randomUUID } from 'node:crypto';
import { getLogger, LogCategories } from '../../common/logger';
import {
  addAuditLog,
  failAuditLogByTaskId,
  updateAuditLogByTaskId,
  upsertAuditLogByTaskId
} from '../../support/user/audit/util';
import { refreshTrainingAuditTask } from './training/audit';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

/** 集合导入来源，仅用于审计展示；业务显式传入 sourceType 时优先使用。 */
export type CollectionImportSourceType =
  | 'backup'
  | 'template'
  | 'image'
  | 'link'
  | 'external_file'
  | 'api'
  | 'text'
  | 'file';

export type CollectionImportAudit = {
  /** 审计任务 ID；关闭审计且无外部任务时为 undefined，需透传给训练队列以维持任务归属 */
  taskId?: string;
  /** 业务事务失败时把导入任务收口为 failed；内部吞掉异常，调用方无需 catch */
  fail: (error: unknown) => Promise<void>;
  /** 业务成功后回填真实 collectionId 并尝试收口一次；内部吞掉异常，调用方无需 catch */
  bindCollection: (collectionId: string) => Promise<void>;
};

export type DatasetTaskAudit = {
  taskId: string;
  created: boolean;
  finish: (params: {
    result: string;
    metadata?: Record<string, TeamAuditMetadataValue>;
  }) => Promise<void>;
  fail: (failureReason: string) => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * 创建通用任务型审计上下文，统一处理 processing 主记录、CAS 收口、失败收口和训练刷新。
 * API handler 只负责传入业务 metadata；审计异常始终作为旁路问题记录，不覆盖主流程结果。
 */
export const startDatasetTaskAudit = async ({
  taskId: externalTaskId,
  teamId,
  tmbId,
  scope = 'member',
  event,
  params
}: {
  taskId?: string;
  teamId: string;
  tmbId?: string;
  scope?: 'member' | 'system';
  event: AuditEventEnum;
  params: Record<string, unknown>;
}): Promise<DatasetTaskAudit> => {
  const taskId = externalTaskId ?? randomUUID();
  const auditParams = {
    ...params,
    result: 'processing',
    sourceFinished: false
  };
  const created =
    scope === 'member'
      ? tmbId
        ? await upsertAuditLogByTaskId({
            teamId,
            tmbId,
            scope: 'member',
            event,
            taskId,
            params: auditParams
          })
        : false
      : await upsertAuditLogByTaskId({
          teamId,
          scope: 'system',
          event,
          taskId,
          params: auditParams
        });

  return {
    taskId,
    created,
    finish: async ({ result, metadata }) => {
      if (!created) return;
      await updateAuditLogByTaskId({
        teamId,
        taskId,
        scope,
        event,
        result,
        expectedResult: 'processing',
        metadata: {
          sourceFinished: true,
          ...metadata
        }
      }).catch((error) => {
        logger.warn('Dataset task audit finish failed', { error, teamId, taskId, event });
      });
    },
    fail: async (failureReason) => {
      if (!created) return;
      await failAuditLogByTaskId({
        teamId,
        taskId,
        scope,
        event,
        failureReason
      }).catch((error) => {
        logger.warn('Dataset task audit failure update failed', {
          error,
          teamId,
          taskId,
          event
        });
      });
    },
    refresh: async () => {
      if (created) await refreshTrainingAuditTask(taskId);
    }
  };
};

export type DatasetImportAudit = {
  /** 审计任务 ID，必须与事务内创建的训练任务关联 */
  taskId: string;
  /** 事务完成后通过 CAS 回填源阶段结果；内部吞掉旁路审计异常 */
  finish: (params: {
    result: string;
    insertLen: string;
    successCount: string;
    failedCount: string;
    sourceFailedCount?: string;
    details?: TeamAuditDetail[];
    failureReason?: string;
  }) => Promise<void>;
};

/**
 * 在批量导入事务前创建 processing 主审计，并在事务结束后通过 CAS 回填结果。
 *
 * 训练任务和集合写入可能在事务提交后先于审计收口完成；预先落一条 sourceFinished=false
 * 的主记录可以让训练队列和定时补偿任务看到稳定的审计锚点，避免进程在提交与 addAuditLog
 * 之间退出后只留下带 auditTaskId 的孤儿训练任务。
 * addAuditLog/updateAuditLogByTaskId 都是审计旁路，异常只记录日志，不影响导入主流程。
 */
export const startDatasetImportAudit = async ({
  taskId: externalTaskId,
  teamId,
  tmbId,
  datasetId,
  datasetName,
  collectionName,
  sourceType,
  insertLen,
  details
}: {
  taskId?: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  datasetName: string;
  collectionName: string;
  sourceType: string;
  insertLen: string;
  details?: TeamAuditDetail[];
}): Promise<DatasetImportAudit> => {
  const taskId = externalTaskId ?? randomUUID();

  try {
    const auditCreated = await addAuditLog({
      teamId,
      tmbId,
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      params: {
        datasetId,
        datasetName,
        collectionName,
        sourceType,
        result: 'processing',
        insertLen,
        successCount: '0',
        failedCount: '0',
        sourceFailedCount: '0',
        taskId,
        sourceFinished: false,
        ...(details && details.length > 0 ? { details } : {})
      }
    });
    if (auditCreated === false) {
      logger.warn('Dataset import audit start was not created', { teamId, taskId });
    }
  } catch (error) {
    // 生产实现会吞掉写入异常；保留 catch 兼容 mock/替代实现，不能阻断已准备好的导入流程。
    logger.warn('Dataset import audit start failed', { error, teamId, taskId });
  }

  return {
    taskId,
    finish: async ({
      result,
      insertLen: finalInsertLen,
      successCount,
      failedCount,
      sourceFailedCount,
      details: finalDetails,
      failureReason
    }) => {
      try {
        await updateAuditLogByTaskId({
          teamId,
          taskId,
          scope: 'member',
          event: AuditEventEnum.IMPORT_DATASET_CONTENT,
          result,
          // 提交后的回填只能更新仍处于 processing 的主记录，不能覆盖训练队列已经收口的终态。
          expectedResult: 'processing',
          metadata: {
            insertLen: finalInsertLen,
            successCount,
            failedCount,
            sourceFinished: true,
            ...(sourceFailedCount !== undefined ? { sourceFailedCount } : {}),
            ...(failureReason ? { failureReason } : {}),
            ...(finalDetails !== undefined ? { details: finalDetails } : {})
          }
        });
      } catch (error) {
        // 集合与训练任务已经提交时，审计 CAS 失败不能让接口把成功业务报告成失败。
        logger.warn('Dataset import audit finish failed', { error, teamId, taskId });
      }
    }
  };
};

/**
 * 创建集合导入的主审计事件（状态 processing），并返回供业务收口使用的审计对象。
 *
 * 设计原因：
 * - addAuditLog 内部已重试并吞掉写入失败，创建处无需再包 then/catch；
 * - 关闭审计但外部传入 taskId 时（批量导入、网站同步等由调用方自建父任务的场景），
 *   仍返回审计对象以便 taskId 透传给训练队列，但 fail/bindCollection 均为 no-op，
 *   避免子流程误改父任务的审计明细。
 */
export const startCollectionImportAudit = async ({
  enabled,
  taskId: externalTaskId,
  teamId,
  tmbId,
  datasetId,
  datasetName,
  collectionName,
  sourceType,
  trainingType,
  imageIds,
  rawText,
  rawLink,
  externalFileId,
  externalFileUrl,
  apiFileId,
  chunkSize,
  indexSize
}: {
  enabled: boolean;
  taskId?: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  datasetName: string;
  collectionName: string;
  sourceType?: CollectionImportSourceType;
  trainingType: DatasetCollectionDataProcessModeEnum;
  imageIds?: string[];
  rawText?: string;
  rawLink?: string;
  externalFileId?: string;
  externalFileUrl?: string;
  apiFileId?: string;
  chunkSize?: number;
  indexSize?: number;
}): Promise<CollectionImportAudit> => {
  const taskId = externalTaskId ?? (enabled ? randomUUID() : undefined);
  const noop = async () => {};
  if (!enabled || !taskId) return { taskId, fail: noop, bindCollection: noop };

  const resolveCollectionImportSourceType = () => {
    if (sourceType) return sourceType;
    if (trainingType === DatasetCollectionDataProcessModeEnum.backup) return 'backup';
    if (trainingType === DatasetCollectionDataProcessModeEnum.template) return 'template';
    if (imageIds) return 'image';
    if (rawLink) return 'link';
    if (externalFileId || externalFileUrl) return 'external_file';
    if (apiFileId) return 'api';
    if (rawText) return 'text';
    return 'file';
  };

  const resolvedSourceType = resolveCollectionImportSourceType();
  /** 创建时还没有 collectionId，业务成功后由 bindCollection 回填同一条明细 */
  const buildDetail = (collectionId?: string): TeamAuditDetail => ({
    ...(collectionId ? { resourceId: collectionId } : {}),
    resourceName: collectionName,
    resourceType: 'collection',
    sourceType: resolvedSourceType,
    sourceName: collectionName,
    action: 'import',
    result: 'processing',
    processingParams: {
      trainingType,
      chunkSize: chunkSize ?? '',
      indexSize: indexSize ?? ''
    }
  });

  await addAuditLog({
    teamId,
    tmbId,
    scope: 'member',
    event: AuditEventEnum.IMPORT_DATASET_CONTENT,
    params: {
      datasetId,
      datasetName,
      collectionName,
      sourceType: resolvedSourceType,
      sourceName: collectionName,
      trainingType,
      chunkSize: String(chunkSize ?? ''),
      indexSize: String(indexSize ?? ''),
      result: 'processing',
      insertLen: '1',
      successCount: '0',
      failedCount: '0',
      taskId,
      details: [buildDetail()],
      // 事务提交及 collection 绑定前，训练队列可能已经消费完当前可见任务。
      sourceFinished: false
    }
  });

  return {
    taskId,
    fail: async (error) => {
      try {
        await failAuditLogByTaskId({
          teamId,
          taskId,
          scope: 'member',
          event: AuditEventEnum.IMPORT_DATASET_CONTENT,
          failureReason: getErrText(error)
        });
      } catch (auditError) {
        // 收口失败不能掩盖真实业务异常：调用方在 fail 之后会重新抛出业务错误
        logger.warn('Collection import audit failure update failed', {
          error: auditError,
          teamId,
          auditTaskId: taskId
        });
      }
    },
    bindCollection: async (collectionId) => {
      try {
        await updateAuditLogByTaskId({
          teamId,
          taskId,
          scope: 'member',
          event: AuditEventEnum.IMPORT_DATASET_CONTENT,
          result: 'processing',
          // 回填不能重新打开已经由 worker 收口的失败/成功事件。
          expectedResult: 'processing',
          metadata: {
            details: [buildDetail(collectionId)],
            // 单集合导入的占位 successCount 在资源成功绑定后回填为 1，避免收口继续使用初始化值 0。
            successCount: '1',
            // 先完成资源绑定，再允许训练队列收口主审计。
            sourceFinished: true
          }
        });
      } catch (error) {
        // 集合与训练数据此时已提交，回填失败不能让已成功的接口返回 500
        logger.warn('Collection import audit update failed', {
          error,
          teamId,
          auditTaskId: taskId
        });
      }
      // 训练数据已入队，立即尝试收口一次，避免队列先消费完时事件停留在 processing
      await refreshTrainingAuditTask(taskId);
    }
  };
};
