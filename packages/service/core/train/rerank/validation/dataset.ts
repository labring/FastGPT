import { addLog } from '../../../../common/system/log';
import type { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { validateDatasetReadiness, type DatasetReadinessErrorConfig } from '../../common/utils';

const rerankErrorConfig: DatasetReadinessErrorConfig = {
  noDatasetConfigured: RerankTrainErrEnum.rerankValidationNoDatasetConfigured,
  datasetNoSynthesisIndex: RerankTrainErrEnum.rerankValidationDatasetNoSynthesisIndex,
  insufficientChunks: RerankTrainErrEnum.rerankTaskInsufficientChunks
};

/**
 * Validate that all given datasets have ready indexes for the target index type
 * and meet the minimum chunk threshold.
 *
 * Delegates to shared validateDatasetReadiness with rerank-specific error enums.
 *
 * @param datasetIds - Dataset IDs to validate (must be non-empty)
 * @param indexType - Target index type to validate (must exist in each dataset)
 * @throws {RerankTrainErrEnum} When validation fails
 */
export async function validateDatasetTargetIndexes(
  datasetIds: string[],
  indexType: `${DatasetDataIndexTypeEnum}`
): Promise<void> {
  addLog.info('Rerank dataset validation started', {
    datasetCount: datasetIds.length,
    indexType
  });

  await validateDatasetReadiness(datasetIds, indexType, rerankErrorConfig);

  addLog.info('Rerank dataset validation completed', {
    datasetCount: datasetIds.length,
    indexType
  });
}
