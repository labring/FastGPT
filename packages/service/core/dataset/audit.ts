import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { TeamAuditDetail } from '@fastgpt/global/support/user/audit/type';
import { randomUUID } from 'node:crypto';
import { getLogger, LogCategories } from '../../common/logger';
import {
  addAuditLog,
  failAuditLogByTaskId,
  updateAuditLogByTaskId
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

/**
 * 按导入参数推断集合来源，判断顺序与 createCollectionAndInsertData 的参数优先级一致：
 * 先看训练模式（备份/模板），再依次看图片、链接、外部文件、API 文件、纯文本，兜底为文件上传。
 */
const resolveCollectionImportSourceType = ({
  sourceType,
  trainingType,
  imageIds,
  rawText,
  rawLink,
  externalFileId,
  externalFileUrl,
  apiFileId
}: {
  sourceType?: CollectionImportSourceType;
  trainingType: DatasetCollectionDataProcessModeEnum;
  imageIds?: string[];
  rawText?: string;
  rawLink?: string;
  externalFileId?: string;
  externalFileUrl?: string;
  apiFileId?: string;
}): CollectionImportSourceType => {
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

  const resolvedSourceType = resolveCollectionImportSourceType({
    sourceType,
    trainingType,
    imageIds,
    rawText,
    rawLink,
    externalFileId,
    externalFileUrl,
    apiFileId
  });
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
      taskId,
      details: [buildDetail()]
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
          metadata: {
            details: [buildDetail(collectionId)]
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
