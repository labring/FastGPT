import { getQueue, QueueNames } from '../../../../common/bullmq';
import { DEFAULT_JOB_BACKOFF_DELAY } from '../constants';

/** Embedding train data generation config */
export type EmbeddingTrainDataGenerateConfig = {
  sampleSize?: number;
  forceRegenerate?: boolean;
  minNegativeSamples?: number;
  maxNegativeSamples?: number;
  includeOriginalQ?: boolean;
};

export type EmbeddingTrainDataGenerateJobData = {
  trainsetId: string;
  datasetIds: string[]; // Required: knowledge base IDs (decoupled from App)
  generateConfig?: EmbeddingTrainDataGenerateConfig;
};

export const embeddingTrainDataGenerateQueue = getQueue<EmbeddingTrainDataGenerateJobData>(
  QueueNames.embeddingTrainDataGenerate,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: DEFAULT_JOB_BACKOFF_DELAY },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  }
);
