import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { rebuildDatasetDataIndexes } from '@/service/core/dataset/data/data';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { delay, retryFn } from '@fastgpt/global/common/system/utils';
import {
  claimTrainingTask,
  TrainingLeaseLostError
} from '@fastgpt/service/core/dataset/training/service';
import { cleanupUnusedDatasetSynonymMappings } from '@fastgpt/service/core/dataset/synonym/entity';

const logger = getLogger(LogCategories.MODULE.DATASET.EMBEDDING);

type RebuildMode = TrainingModeEnum.rebuildIndex | TrainingModeEnum.rebuildSynonym;
type RebuildContext = { teamId: string; tmbId: string; datasetId: string; billId: string };
type PopulateType = {
  dataset: Pick<DatasetSchemaType, 'vectorModelId' | 'vectorModel'>;
  collection: { _id: string };
  data?: { _id: string };
};

/**
 * 两类重建共用租约、计费与失败处理；调用方提供各自的接力入队和功能开关。
 * 每个进程中每类重建最多运行一个循环，与首次索引训练的并发预算独立。
 * 续接失败保留当前任务重试；索引写入与任务完成由同一租约事务提交。
 */
export const runDatasetRebuildQueue = async ({
  mode,
  enqueueNext,
  isEnabled = () => true
}: {
  mode: RebuildMode;
  enqueueNext: (context: RebuildContext) => Promise<boolean>;
  isEnabled?: () => boolean;
}): Promise<void> => {
  const queueKey = mode === TrainingModeEnum.rebuildIndex ? 'vectorQueueLen' : 'synonymQueueLen';
  if (!isEnabled() || (global[queueKey] ?? 0) >= 1) return;

  // 检查和占用名额之间没有 await，防止同一进程的多次调度同时进入。
  global[queueKey] = 1;
  const synonymCleanupContexts = new Map<string, RebuildContext>();
  try {
    while (isEnabled()) {
      const start = Date.now();
      let claimed;
      try {
        claimed = await claimTrainingTask<PopulateType>({
          mode,
          populate: [
            { path: 'dataset', select: 'vectorModelId vectorModel' },
            { path: 'collection', select: '_id' },
            { path: 'data', select: '_id' }
          ]
        });
      } catch (error) {
        logger.error('Rebuild queue fetch task failed', { mode, error });
        await delay(500);
        continue;
      }
      if (!claimed) break;

      const { data, lease } = claimed;
      const context: RebuildContext = {
        teamId: String(data.teamId),
        tmbId: String(data.tmbId),
        datasetId: String(data.datasetId),
        billId: data.billId
      };
      if (mode === TrainingModeEnum.rebuildSynonym) {
        synonymCleanupContexts.set(context.datasetId, context);
      }
      /** 接力失败不能吞掉，否则当前任务完成后可能仍有待重建数据却没有 training。 */
      const enqueueFollowing = () => retryFn(() => enqueueNext(context));
      try {
        lease.start();
        if (!data.dataset || !data.collection) {
          // 当前集合被删除时，仍续接数据集内其它集合的重建。
          if (data.dataset && data.dataId) await enqueueFollowing();
          await lease.complete();
          continue;
        }
        if (!(await checkTeamAiPointsAndLock(data.teamId, String(data._id)))) continue;

        logger.info('Rebuild queue task started', {
          mode,
          trainingId: data._id,
          datasetId: data.datasetId,
          dataId: data.dataId
        });
        try {
          await enqueueFollowing();
          if (!data.data) {
            await lease.complete();
            continue;
          }
          const modelHandle = await getModelHandle();
          const model = modelHandle.getEmbeddingModelData(
            getDatasetModelReference(data.dataset, 'embedding')
          );
          const { tokens } = await rebuildDatasetDataIndexes({
            dataId: String(data.data._id),
            model,
            diffSynonym: mode === TrainingModeEnum.rebuildSynonym,
            commit: lease.complete
          });
          pushGenerateVectorUsage({
            teamId: data.teamId,
            tmbId: data.tmbId,
            inputTokens: tokens,
            model,
            usageId: data.billId
          });
          logger.info('Rebuild queue task finished', {
            mode,
            durationMs: Date.now() - start,
            trainingId: data._id,
            datasetId: data.datasetId,
            dataId: data.dataId
          });
        } catch (error) {
          logger.error('Rebuild queue task failed', {
            mode,
            error,
            trainingId: data._id,
            datasetId: data.datasetId,
            dataId: data.dataId
          });
          if (!(error instanceof TrainingLeaseLostError)) await lease.fail(error);
          await delay(100);
        }
      } finally {
        await lease.stop();
      }
    }
  } catch (error) {
    logger.error('Rebuild queue loop failed', { mode, error });
  } finally {
    // 每轮消费结束后按知识库回收一次，避免逐条查询，也覆盖并行 worker 乱序完成的情况。
    for (const context of synonymCleanupContexts.values()) {
      await cleanupUnusedDatasetSynonymMappings(context).catch((error) => {
        logger.error('Failed to clean up historical synonym mappings', { error, ...context });
      });
    }
    global[queueKey] = 0;
    logger.debug('Rebuild queue loop exit', { mode });
  }
};
