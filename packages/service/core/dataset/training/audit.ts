import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  TeamAuditDetailSchema,
  type TeamAuditDetail
} from '@fastgpt/global/support/user/audit/type';
import { MongoTeamAudit } from '../../../support/user/audit/schema';
import { updateAuditLogByTaskId } from '../../../support/user/audit/util';
import { getLogger, LogCategories } from '../../../common/logger';
import { MongoDatasetTraining } from './schema';
import { finalErrorTrainingMatch, isFinalErrorTraining } from './query';

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

    // 终态只允许首次收口者写入；避免对已结束事件继续读取训练任务并尝试回写。
    const currentResult = audit.metadata?.result;
    if (currentResult !== undefined && currentResult !== 'processing') return;

    const event = audit.event as TrackedAuditEvent;

    // 生产者先创建 processing 审计，再异步绑定资源/写入源阶段结果；在生产者显式收口前，
    // “当前没有训练记录”只代表训练队列尚未看到任务，不能据此把主审计提前置为终态。
    // 旧审计没有该字段，按已收口兼容处理。
    if (audit.metadata?.sourceFinished === false) return;

    // 只需确认是否存在非最终失败任务，不需要统计数量；findOne 找到首条记录即可停止扫描。
    // 队列层会在一轮 drain 后统一调用本函数，避免每个 chunk/对象完成时重复查询同一 task。
    const notFinalError = await MongoDatasetTraining.findOne(
      {
        auditTaskId,
        $nor: [finalErrorTrainingMatch]
      },
      '_id'
    ).lean();
    if (notFinalError) return;

    const remaining = (await MongoDatasetTraining.find(
      { auditTaskId, ...finalErrorTrainingMatch },
      '_id collectionId dataId retryCount lockTime errorMsg'
    )
      .populate<{ collection?: { name?: string } }>({ path: 'collection', select: 'name' })
      .lean()) as RemainingTraining[];

    /** 返回不同事件对应的业务对象 ID，避免把一个文件的多个数据块算成多个失败对象。 */
    const getAuditResourceId = (training: RemainingTraining) => {
      if (
        event === AuditEventEnum.IMPORT_DATASET_CONTENT ||
        event === AuditEventEnum.SYNC_DATASET
      ) {
        return String(training.collectionId);
      }
      if (event === AuditEventEnum.REBUILD_DATASET_INDEX) {
        return String(training.dataId ?? training._id);
      }
      return String(training._id);
    };

    const failedByResourceId = new Map<string, RemainingTraining>();
    for (const training of remaining) {
      const resourceId = getAuditResourceId(training);
      const previous = failedByResourceId.get(resourceId);
      if (!previous || (!previous.errorMsg && training.errorMsg)) {
        failedByResourceId.set(resourceId, training);
      }
    }

    // 失败明细按 resourceId 去重；缺少 resourceId 的明细按条计数。
    const countFailedDetails = (detailList: TeamAuditDetail[]) => {
      const failedResourceIds = new Set<string>();
      let count = 0;
      for (const detail of detailList) {
        if (detail.result !== 'failed') continue;
        if (!detail.resourceId) {
          count += 1;
        } else if (!failedResourceIds.has(detail.resourceId)) {
          failedResourceIds.add(detail.resourceId);
          count += 1;
        }
      }
      return count;
    };
    const getCount = (value: unknown) => {
      const count = Number(value);
      return Number.isFinite(count) && count >= 0 ? count : 0;
    };

    const initialDetails = Array.isArray(audit.metadata?.details)
      ? audit.metadata.details.flatMap((detail) => {
          const parsed = TeamAuditDetailSchema.safeParse(detail);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    const details = initialDetails.map<TeamAuditDetail>((detail) => {
      const failed = detail.resourceId ? failedByResourceId.get(detail.resourceId) : undefined;
      if (failed) {
        return {
          ...detail,
          result: 'failed',
          ...(failed.errorMsg ? { failureReason: failed.errorMsg } : {})
        };
      }
      // 同步处理器可能已经写入 success/failed/unchanged 等终态，不能再无条件覆盖。
      return detail.result === 'processing' ? { ...detail, result: 'success' } : detail;
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

    const failedDetailCount = countFailedDetails(details);
    const existingTrainingFailedCount = getCount(audit.metadata?.trainingFailedCount);
    const isSourceBackedEvent =
      event === AuditEventEnum.SYNC_DATASET || event === AuditEventEnum.IMPORT_DATASET_CONTENT;
    const sourceFailedCount = isSourceBackedEvent
      ? getCount(
          audit.metadata?.sourceFailedCount ??
            (event === AuditEventEnum.IMPORT_DATASET_CONTENT
              ? audit.metadata?.failedCount
              : undefined)
        )
      : 0;
    const trainingFailedCount = isSourceBackedEvent
      ? Math.max(existingTrainingFailedCount, failedByResourceId.size)
      : 0;
    const failedCount = isSourceBackedEvent
      ? Math.max(sourceFailedCount + trainingFailedCount, failedDetailCount)
      : Math.max(failedDetailCount, failedByResourceId.size);

    // 同步/导入的源阶段失败不一定会生成 training；删除操作没有训练任务，但成功删除项仍需计入收口总数。
    const expectedCount = (() => {
      if (event === AuditEventEnum.SYNC_DATASET) {
        return (
          getCount(audit.metadata?.addedCount) +
          getCount(audit.metadata?.updatedCount) +
          getCount(audit.metadata?.deletedCount) +
          sourceFailedCount
        );
      }
      if (
        event === AuditEventEnum.IMPORT_DATASET_CONTENT &&
        audit.metadata?.successCount !== undefined
      ) {
        return getCount(audit.metadata.successCount) + sourceFailedCount;
      }
      return getCount(audit.metadata?.count ?? audit.metadata?.insertLen ?? 0);
    })();
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
      // 收口是 processing -> terminal 的一次性状态转换，避免延迟 worker 覆盖先落库的失败。
      expectedResult: 'processing',
      metadata: {
        successCount: String(successCount),
        failedCount: String(failedCount),
        ...(event === AuditEventEnum.SYNC_DATASET
          ? {
              sourceFailedCount: String(sourceFailedCount),
              trainingFailedCount: String(trainingFailedCount)
            }
          : {}),
        ...(details.length > 0 ? { details } : {})
      }
    });
  } catch (error) {
    logger.error('Training audit collapse failed', { error, auditTaskId });
  }
};

type TrainingRetryScope = Pick<DatasetTrainingSchemaType, 'teamId' | 'datasetId'> &
  Partial<Pick<DatasetTrainingSchemaType, 'collectionId'>>;
type RetryTrainingAuditTask = Pick<
  DatasetTrainingSchemaType,
  '_id' | 'retryCount' | 'lockTime' | 'errorMsg'
>;
type RetryTrainingAuditResult = 'processing' | 'success' | 'partial_failed' | 'failed';

/**
 * 生产者部分提交失败后按训练任务实际状态更新重试审计。
 *
 * 不能直接调用通用的 failAuditLogByTaskId：分批事务可能已经恢复并删除了前一批任务，
 * 也可能还有任务正在队列中。缺失任务视为成功，最终失败任务只更新为 failed，仍可重试的
 * 任务保持 processing；只有确认没有活跃任务后，才把主审计 CAS 收口为终态。
 *
 * 该函数是审计旁路，查询或更新失败只记录日志，不覆盖生产者原始异常，也不阻止后续 worker
 * 继续处理已经提交的任务。
 */
export const recoverRetryTrainingAuditAfterProducerFailure = async ({
  teamId,
  auditTaskId,
  taskIds,
  trainingScope,
  failureReason
}: {
  teamId: string;
  auditTaskId: string;
  taskIds: string[];
  trainingScope: TrainingRetryScope;
  failureReason: string;
}): Promise<void> => {
  try {
    const audit = await MongoTeamAudit.findOne(
      {
        teamId,
        scope: 'member',
        event: AuditEventEnum.RETRY_TRAINING,
        'metadata.taskId': auditTaskId
      },
      'metadata.result metadata.details'
    ).lean();
    if (!audit || (audit.metadata?.result && audit.metadata.result !== 'processing')) return;

    const uniqueTaskIds = Array.from(new Set(taskIds));
    const tasks = (await MongoDatasetTraining.find(
      {
        ...trainingScope,
        _id: { $in: uniqueTaskIds }
      },
      '_id retryCount lockTime errorMsg'
    ).lean()) as RetryTrainingAuditTask[];
    const taskById = new Map(tasks.map((task) => [String(task._id), task]));
    const getResult = (taskId: string): RetryTrainingAuditResult => {
      const task = taskById.get(taskId);
      // 训练租约完成后会删除任务；删除是 worker 成功消费的唯一可靠信号。
      if (!task) return 'success';
      return isFinalErrorTraining(task) ? 'failed' : 'processing';
    };
    const taskResults = new Map(uniqueTaskIds.map((taskId) => [taskId, getResult(taskId)]));
    const failedCount = Array.from(taskResults.values()).filter(
      (result) => result === 'failed'
    ).length;
    const processingCount = Array.from(taskResults.values()).filter(
      (result) => result === 'processing'
    ).length;
    const successCount = Array.from(taskResults.values()).filter(
      (result) => result === 'success'
    ).length;

    const rawDetails = audit.metadata?.details;
    const isTeamAuditDetail = (value: unknown): value is TeamAuditDetail =>
      TeamAuditDetailSchema.safeParse(value).success;
    const details = (() => {
      if (!Array.isArray(rawDetails)) return undefined;

      const validDetails = rawDetails.filter(isTeamAuditDetail);
      if (validDetails.length !== rawDetails.length) return undefined;

      return validDetails.map((detail) => {
        const resourceId = detail.resourceId;
        const result = resourceId ? taskResults.get(resourceId) : undefined;
        if (result === 'success') return { ...detail, result: 'success' };
        if (result !== 'failed') return detail;

        const task = resourceId ? taskById.get(resourceId) : undefined;
        return {
          ...detail,
          result: 'failed',
          failureReason: task?.errorMsg ?? failureReason
        };
      });
    })();

    const result: RetryTrainingAuditResult = (() => {
      if (processingCount > 0) return 'processing';
      if (failedCount === 0) return 'success';
      return successCount > 0 ? 'partial_failed' : 'failed';
    })();

    await updateAuditLogByTaskId({
      teamId,
      taskId: auditTaskId,
      scope: 'member',
      event: AuditEventEnum.RETRY_TRAINING,
      result,
      expectedResult: 'processing',
      metadata: {
        sourceFinished: true,
        successCount: String(successCount),
        failedCount: String(failedCount),
        ...(failedCount > 0 ? { failureReason } : {}),
        ...(details ? { details } : {})
      }
    });
  } catch (error) {
    logger.error('Retry training audit recovery failed', {
      error,
      teamId,
      auditTaskId
    });
  }
};
