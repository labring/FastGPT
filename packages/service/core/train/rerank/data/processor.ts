import type { Processor } from 'bullmq';
import type { RerankTrainDataGenerateJobData } from './mq';
import { generateAppTrainsetDataCore } from './controller';
import { addLog } from '../../../../common/system/log';

/** Rerank train data generation processor */
export const rerankTrainDataGenerateProcessor: Processor<RerankTrainDataGenerateJobData> = async (
  job
) => {
  const { appId, trainsetId, datasetIds, generateConfig } = job.data;

  if (!appId || !trainsetId) {
    const error = new Error('Missing required parameters: appId or trainsetId');
    addLog.error('Rerank train data generation failed - missing parameters', {
      appId,
      trainsetId,
      datasetIds
    });
    throw error;
  }

  const datasetCount = Array.isArray(datasetIds) ? datasetIds.length : 0;

  addLog.info('Start rerank train data generation', {
    appId,
    trainsetId,
    datasetCount,
    hasDatasetIds: !!datasetIds,
    generateConfig
  });

  try {
    await generateAppTrainsetDataCore({
      appId,
      trainsetId,
      datasetIds,
      generateConfig
    });

    addLog.info('Rerank train data generation completed', {
      trainsetId
    });
  } catch (error) {
    addLog.error('Rerank train data generation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      appId,
      trainsetId,
      datasetIds,
      generateConfig
    });
    throw error;
  }
};
