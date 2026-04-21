import { getQueue, QueueNames } from '../../../../common/bullmq';
import { DEFAULT_JOB_BACKOFF_DELAY } from '../constants';
import type { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

/** Rerank train data generation config */
export type RerankTrainDataGenerateConfig = {
  sampleSize?: number;
  weights?: Record<string, number>;
  forceRegenerate?: boolean;
  indexType: `${DatasetDataIndexTypeEnum}`;
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
      backoff: { type: 'exponential', delay: DEFAULT_JOB_BACKOFF_DELAY },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  }
);
