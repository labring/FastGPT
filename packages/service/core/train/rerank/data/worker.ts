import { getWorker, QueueNames } from '../../../../common/bullmq';
import { addLog } from '../../../../common/system/log';
import { type RerankTrainDataGenerateJobData } from './mq';
import { rerankTrainDataGenerateProcessor } from './processor';
import {
  DEFAULT_WORKER_STALLED_INTERVAL,
  DEFAULT_TRAIN_DATA_GENERATE_CONCURRENCY,
  DEFAULT_WORKER_MAX_STALLED_COUNT
} from '../constants';

export function initRerankTrainDataWorker() {
  const worker = getWorker<RerankTrainDataGenerateJobData>(
    QueueNames.rerankTrainDataGenerate,
    rerankTrainDataGenerateProcessor,
    {
      stalledInterval: DEFAULT_WORKER_STALLED_INTERVAL,
      maxStalledCount:
        global.systemEnv?.trainConfig?.maxStalledCount || DEFAULT_WORKER_MAX_STALLED_COUNT,
      concurrency:
        global.systemEnv?.trainConfig?.dataGenerateConcurrency ||
        DEFAULT_TRAIN_DATA_GENERATE_CONCURRENCY
    }
  );

  worker.on('active', (job) => {
    if (job?.data) {
      const { trainsetId, appId } = job.data;
      addLog.info('[RerankTrainData] Generation task started', {
        jobId: job.id,
        trainsetId,
        appId
      });
    }
  });

  worker.on('completed', (job) => {
    if (job?.data) {
      const { trainsetId } = job.data;
      addLog.info('[RerankTrainData] Generation task completed', {
        jobId: job.id,
        trainsetId
      });
    }
  });

  worker.on('stalled', async (jobId: string) => {
    addLog.warn('[RerankTrainData] Generation task stalled, will be retried', {
      jobId
    });
  });

  worker.on('failed', (job, error) => {
    if (job?.data) {
      const { trainsetId } = job.data;
      addLog.error('[RerankTrainData] Generation task failed', {
        jobId: job.id,
        trainsetId,
        error: error.message
      });
    }
  });

  addLog.info('[RerankTrainData] Worker created successfully');
  return worker;
}
