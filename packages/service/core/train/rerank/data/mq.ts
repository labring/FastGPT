import { getQueue, QueueNames } from '../../../../common/bullmq';
import { DEFAULT_JOB_BACKOFF_DELAY } from '../constants';

/** Rerank train data generation config */
export type RerankTrainDataGenerateConfig = {
  sampleSize?: number;
  forceRegenerate?: boolean;
  minNegativeSamples?: number;
  maxNegativeSamples?: number;
  includeOriginalQ?: boolean;
};

export type RerankTrainDataGenerateJobData = {
  appId: string;
  trainsetId: string;
  datasetIds?: string[];
  generateConfig?: RerankTrainDataGenerateConfig;
};

export const rerankTrainDataGenerateQueue = getQueue<RerankTrainDataGenerateJobData>(
  QueueNames.rerankTrainDataGenerate,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: DEFAULT_JOB_BACKOFF_DELAY },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  }
);
