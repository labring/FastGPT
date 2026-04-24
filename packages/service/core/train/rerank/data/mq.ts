import { getQueue, QueueNames } from '../../../../common/bullmq';
import { trainEnv } from '../../common/env';
import type { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

/** Rerank train data generation config */
export type RerankTrainDataGenerateConfig = {
  sampleSize?: number;
  weights?: Record<string, number>;
  forceRegenerate?: boolean;
  indexType: `${DatasetDataIndexTypeEnum}`;
  indexMultiStrategy?: 1 | 2;
  negativeStrategy?: 1 | 2 | 3 | 4;
  minNegativeSamples?: number;
  maxNegativeSamples?: number;
};

export type RerankTrainDataGenerateJobData = {
  trainsetId: string;
  datasetIds: string[];
  generateConfig: RerankTrainDataGenerateConfig;
};

export const rerankTrainDataGenerateQueue = getQueue<RerankTrainDataGenerateJobData>(
  QueueNames.rerankTrainDataGenerate,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: trainEnv.TRAIN_JOB_BACKOFF_DELAY },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  }
);
