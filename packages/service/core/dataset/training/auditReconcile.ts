import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { TeamAuditDetailSchema } from '@fastgpt/global/support/user/audit/type';
import { MongoTeamAudit } from '../../../support/user/audit/schema';
import { updateAuditLogByTaskId } from '../../../support/user/audit/util';
import { getLogger, LogCategories } from '../../../common/logger';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetTraining } from './schema';
import { finalErrorTrainingMatch } from './query';
import { refreshTrainingAuditTask } from './audit';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);
const STALE_SOURCE_AUDIT_AGE_MS = 2 * 60 * 60 * 1000;
const STALE_SOURCE_AUDIT_BATCH_SIZE = 100;
const STALE_SOURCE_AUDIT_FAILURE_REASON =
  'Source stage did not finish and no recoverable training task remains; operation result is unknown';

const trackedTrainingEvents = [
  AuditEventEnum.IMPORT_DATASET_CONTENT,
  AuditEventEnum.SYNC_DATASET,
  AuditEventEnum.REBUILD_DATASET_INDEX,
  AuditEventEnum.RETRY_TRAINING
] as const;
type TrackedAuditEvent = (typeof trackedTrainingEvents)[number];

/**
 * 修复源阶段已经长时间没有回填 sourceFinished 的训练审计。
 *
 * 事务提交后即使进程在 source 回填前退出，训练记录仍然是可查询的可靠信号；无法证明成功
 * 的任务在保护窗口后按未知失败收口，避免审计永久停留 processing。
 */
export const reconcileStaleTrainingAudits = async (): Promise<number> => {
  try {
    const before = new Date(Date.now() - STALE_SOURCE_AUDIT_AGE_MS);
    const audits = await MongoTeamAudit.find(
      {
        event: { $in: trackedTrainingEvents },
        'metadata.result': 'processing',
        'metadata.sourceFinished': false,
        timestamp: { $lt: before }
      },
      '_id teamId scope event metadata'
    )
      .sort({ timestamp: 1 })
      .limit(STALE_SOURCE_AUDIT_BATCH_SIZE)
      .lean();

    let recoveredCount = 0;
    for (const audit of audits) {
      const taskId = typeof audit.metadata?.taskId === 'string' ? audit.metadata.taskId : undefined;
      if (!taskId) continue;

      try {
        const event = audit.event as TrackedAuditEvent;
        const activeTraining = await MongoDatasetTraining.findOne(
          { auditTaskId: taskId, $nor: [finalErrorTrainingMatch] },
          '_id'
        ).lean();
        if (activeTraining) continue;

        const hasTraining = await MongoDatasetTraining.exists({ auditTaskId: taskId });
        const scope = audit.scope === 'system' ? 'system' : 'member';
        const datasetId =
          typeof audit.metadata?.datasetId === 'string' ? audit.metadata.datasetId : undefined;
        const hasPendingRebuildData =
          event === AuditEventEnum.REBUILD_DATASET_INDEX && datasetId
            ? Boolean(
                await MongoDatasetData.exists({
                  teamId: String(audit.teamId),
                  datasetId,
                  indexStatus: {
                    $in: [
                      DatasetDataIndexStatusEnum.rebuildIndexPending,
                      DatasetDataIndexStatusEnum.rebuildIndexRunning
                    ]
                  }
                })
              )
            : false;

        if (event === AuditEventEnum.REBUILD_DATASET_INDEX && !datasetId && !hasTraining) {
          logger.warn('Stale rebuild audit has no dataset id', { auditTaskId: taskId });
          continue;
        }

        const hasFailedRebuildData =
          event === AuditEventEnum.REBUILD_DATASET_INDEX && datasetId && !hasPendingRebuildData
            ? Boolean(
                await MongoDatasetData.exists({
                  teamId: String(audit.teamId),
                  datasetId,
                  indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed
                })
              )
            : false;

        if (hasPendingRebuildData || hasFailedRebuildData) {
          const metadataCount = Number(audit.metadata?.count);
          const rebuildDataCount =
            Number.isFinite(metadataCount) && metadataCount >= 0
              ? metadataCount
              : typeof MongoDatasetData.countDocuments === 'function'
                ? await MongoDatasetData.countDocuments({
                    teamId: String(audit.teamId),
                    datasetId,
                    indexStatus: {
                      $in: [
                        DatasetDataIndexStatusEnum.rebuildIndexPending,
                        DatasetDataIndexStatusEnum.rebuildIndexRunning,
                        DatasetDataIndexStatusEnum.rebuildIndexFailed
                      ]
                    }
                  })
                : 1;
          await updateAuditLogByTaskId({
            teamId: String(audit.teamId),
            taskId,
            scope,
            event,
            result: 'failed',
            expectedResult: 'processing',
            metadata: {
              sourceFinished: true,
              successCount: '0',
              failedCount: String(rebuildDataCount),
              failureReason: hasFailedRebuildData
                ? 'Rebuild data has failed index status'
                : 'Rebuild data has no recoverable training task'
            }
          });
          recoveredCount += 1;
          continue;
        }

        if (!hasTraining && event !== AuditEventEnum.REBUILD_DATASET_INDEX) {
          const getCount = (value: unknown) => {
            const count = Number(value);
            return Number.isFinite(count) && count >= 0 ? count : 0;
          };
          const failedCount = (() => {
            if (event === AuditEventEnum.SYNC_DATASET) {
              return Math.max(
                getCount(audit.metadata?.addedCount) +
                  getCount(audit.metadata?.updatedCount) +
                  getCount(audit.metadata?.sourceFailedCount),
                getCount(audit.metadata?.failedCount),
                1
              );
            }
            return Math.max(
              getCount(audit.metadata?.count),
              getCount(audit.metadata?.insertLen),
              getCount(audit.metadata?.successCount) + getCount(audit.metadata?.sourceFailedCount),
              1
            );
          })();
          const details = Array.isArray(audit.metadata?.details)
            ? audit.metadata.details.flatMap((detail) => {
                const parsed = TeamAuditDetailSchema.safeParse(detail);
                return parsed.success
                  ? [
                      parsed.data.result === 'processing'
                        ? {
                            ...parsed.data,
                            result: 'failed',
                            failureReason: STALE_SOURCE_AUDIT_FAILURE_REASON
                          }
                        : parsed.data
                    ]
                  : [];
              })
            : [];

          await updateAuditLogByTaskId({
            teamId: String(audit.teamId),
            taskId,
            scope,
            event,
            result: 'failed',
            expectedResult: 'processing',
            metadata: {
              successCount: '0',
              failedCount: String(failedCount),
              failureReason: STALE_SOURCE_AUDIT_FAILURE_REASON,
              ...(details.length > 0 ? { details } : {})
            }
          });
          recoveredCount += 1;
          logger.warn('Stale training audit recovered as failed without training records', {
            auditTaskId: taskId,
            event: audit.event,
            failureReason: STALE_SOURCE_AUDIT_FAILURE_REASON
          });
          continue;
        }

        await updateAuditLogByTaskId({
          teamId: String(audit.teamId),
          taskId,
          scope,
          event,
          result: 'processing',
          expectedResult: 'processing',
          metadata: { sourceFinished: true }
        });
        await refreshTrainingAuditTask(taskId);
        recoveredCount += 1;
      } catch (error) {
        logger.warn('Stale training audit recovery failed', {
          error,
          auditTaskId: taskId,
          event: audit.event
        });
      }
    }

    return recoveredCount;
  } catch (error) {
    logger.error('Stale training audit scan failed', { error });
    return 0;
  }
};
