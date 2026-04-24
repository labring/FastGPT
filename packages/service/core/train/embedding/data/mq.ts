import { getQueue, QueueNames } from '../../../../common/bullmq';
import { trainEnv } from '../../common/env';
import type { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

/** Embedding train data generation config */
export type EmbeddingTrainDataGenerateConfig = {
  sampleSize?: number;
  weights?: Record<string, number>;
  forceRegenerate?: boolean;
  indexType: `${DatasetDataIndexTypeEnum}`;
  indexMultiStrategy?: 1 | 2;
  negativeStrategy?: 1 | 2 | 3 | 4;
  minNegativeSamples?: number;
  maxNegativeSamples?: number;
};

export type EmbeddingTrainDataGenerateJobData = {
  trainsetId: string;
  datasetIds: string[];
  generateConfig: EmbeddingTrainDataGenerateConfig;
};

export const embeddingTrainDataGenerateQueue = getQueue<EmbeddingTrainDataGenerateJobData>(
  QueueNames.embeddingTrainDataGenerate,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: trainEnv.TRAIN_JOB_BACKOFF_DELAY },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  }
);
