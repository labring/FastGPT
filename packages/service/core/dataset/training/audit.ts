import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { TeamAuditDetail } from '@fastgpt/global/support/user/audit/type';
import { MongoTeamAudit } from '../../../support/user/audit/schema';
import { updateAuditLogByTaskId } from '../../../support/user/audit/util';
import { getLogger, LogCategories } from '../../../common/logger';
import { MongoDatasetTraining } from './schema';
import { finalErrorTrainingMatch } from './query';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

const trackedTrainingEvents = [
  AuditEventEnum.IMPORT_DATASET_CONTENT,
  AuditEventEnum.SYNC_DATASET,
  AuditEventEnum.REBUILD_DATASET_INDEX,
  AuditEventEnum.RETRY_TRAINING
] as const;

type TrackedAuditEvent = (typeof trackedTrainingEvents)[number];

type RemainingTraining = {
  _id: unknown;
  collectionId: unknown;
  dataId?: unknown;
  retryCount: number;
  lockTime: Date;
  errorMsg?: string;
  collection?: { name?: string };
};

/** 返回不同事件对应的业务对象 ID，避免把一个文件的多个数据块算成多个失败对象。 */
const getAuditResourceId = (event: TrackedAuditEvent, training: RemainingTraining) => {
  if (event === AuditEventEnum.IMPORT_DATASET_CONTENT || event === AuditEventEnum.SYNC_DATASET) {
    return String(training.collectionId);
  }
  if (event === AuditEventEnum.REBUILD_DATASET_INDEX) {
    return String(training.dataId ?? training._id);
  }
  return String(training._id);
};

/**
 * 在关联训练任务全部完成或只剩最终失败项时收口主审计事件。
 * 自动重试期间仍有活跃任务，保持 processing，不额外创建审计事件。
 *
 * 审计是旁路记录：本函数不外抛异常，避免队列 worker 或接口因为收口失败而中断已完成的业务。
 * 调用方无需再包 catch，失败原因统一在此记录日志。
 */
export const refreshTrainingAuditTask = async (auditTaskId?: string): Promise<void> => {
  if (!auditTaskId) return;

  try {
    const audit = await MongoTeamAudit.findOne({
      event: { $in: trackedTrainingEvents },
      'metadata.taskId': auditTaskId
    }).lean();
    if (!audit) return;

    const event = audit.event as TrackedAuditEvent;

    // 先用索引计数判断是否还有“非最终失败”的训练任务：每个 chunk/对象完成都会调用本函数，
    // 若每次都全量读取该 auditTaskId 下的训练记录并 populate，整体是 O(n²) 的读放大。
    // 只有确认全部剩余任务都已最终失败（或没有剩余）时，才读取失败明细做收口。
    const notFinalErrorCount = await MongoDatasetTraining.countDocuments({
      auditTaskId,
      $nor: [finalErrorTrainingMatch]
    });
    if (notFinalErrorCount > 0) return;

    const remaining = (await MongoDatasetTraining.find(
      { auditTaskId, ...finalErrorTrainingMatch },
      '_id collectionId dataId retryCount lockTime errorMsg'
    )
      .populate<{ collection?: { name?: string } }>({ path: 'collection', select: 'name' })
      .lean()) as RemainingTraining[];

    const failedByResourceId = new Map<string, RemainingTraining>();
    for (const training of remaining) {
      const resourceId = getAuditResourceId(event, training);
      const previous = failedByResourceId.get(resourceId);
      if (!previous || (!previous.errorMsg && training.errorMsg)) {
        failedByResourceId.set(resourceId, training);
      }
    }

    const initialDetails = Array.isArray(audit.metadata?.details)
      ? audit.metadata.details.filter(
          (detail): detail is TeamAuditDetail => typeof detail === 'object' && detail !== null
        )
      : [];
    const details = initialDetails.map<TeamAuditDetail>((detail) => {
      const failed = detail.resourceId ? failedByResourceId.get(detail.resourceId) : undefined;
      return {
        ...detail,
        result: failed ? 'failed' : 'success',
        ...(failed?.errorMsg ? { failureReason: failed.errorMsg } : {})
      };
    });
    const knownDetailIds = new Set(details.map((detail) => detail.resourceId).filter(Boolean));
    for (const [resourceId, failed] of failedByResourceId) {
      if (knownDetailIds.has(resourceId)) continue;
      details.push({
        resourceId,
        resourceName: failed.collection?.name ?? resourceId,
        resourceType: event === AuditEventEnum.REBUILD_DATASET_INDEX ? 'data' : 'collection',
        action: event === AuditEventEnum.RETRY_TRAINING ? 'retry' : 'process',
        result: 'failed',
        failureReason: failed.errorMsg ?? 'unknown error'
      });
    }

    // count 与 details 的单位由写入方保证一致（对象数，而非数据块数）
    const expectedCount =
      event === AuditEventEnum.SYNC_DATASET
        ? initialDetails.filter((detail) => detail.action === 'add').length
        : Number(audit.metadata?.count ?? audit.metadata?.insertLen ?? 0);
    const failedCount = failedByResourceId.size;
    const successCount = Math.max(expectedCount - failedCount, 0);
    const result = (() => {
      if (failedCount === 0) return 'success';
      if (successCount > 0) return 'partial_failed';
      return 'failed';
    })();

    await updateAuditLogByTaskId({
      teamId: String(audit.teamId),
      taskId: auditTaskId,
      scope: audit.scope ?? 'member',
      event,
      result,
      metadata: {
        successCount: String(successCount),
        failedCount: String(failedCount),
        ...(details.length > 0 ? { details } : {})
      }
    });
  } catch (error) {
    logger.error('Training audit collapse failed', { error, auditTaskId });
  }
};
