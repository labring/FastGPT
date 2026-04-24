import { addLog } from '../../../../common/system/log';
import type { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { validateDatasetReadiness, type DatasetReadinessErrorConfig } from '../../common/utils';

const embeddingErrorConfig: DatasetReadinessErrorConfig = {
  noDatasetConfigured: EmbeddingTrainErrEnum.embeddingValidationNoDatasetConfigured,
  datasetNoSynthesisIndex: EmbeddingTrainErrEnum.embeddingValidationDatasetNoSynthesisIndex,
  insufficientChunks: EmbeddingTrainErrEnum.embeddingTaskInsufficientChunks
};

/**
 * Validate that all given datasets have ready indexes for the target index type
 * and meet the minimum chunk threshold.
 *
 * Delegates to shared validateDatasetReadiness with embedding-specific error enums.
 *
 * @param datasetIds - Dataset IDs to validate (must be non-empty)
 * @param indexType - Target index type to validate (must exist in each dataset)
 * @throws {EmbeddingTrainErrEnum} When validation fails
 */
export async function validateDatasetTargetIndexes(
  datasetIds: string[],
  indexType: `${DatasetDataIndexTypeEnum}`
): Promise<void> {
  addLog.info('Embedding dataset validation started', {
    datasetCount: datasetIds.length,
    indexType
  });

  await validateDatasetReadiness(datasetIds, indexType, embeddingErrorConfig);

  addLog.info('Embedding dataset validation completed', {
    datasetCount: datasetIds.length,
    indexType
  });
}
