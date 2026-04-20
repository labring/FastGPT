import { MongoDatasetData } from '../../../dataset/data/schema';
import { addLog } from '../../../../common/system/log';
import type { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';

/**
 * Check if a dataset has at least one data entry with the given index type
 *
 * @param datasetId - Dataset ID to check
 * @param indexType - Target index type to look for
 * @returns True if dataset has ready target indexes
 */
async function hasReadyTargetIndexes(
  datasetId: string,
  indexType: `${DatasetDataIndexTypeEnum}`
): Promise<boolean> {
  const count = await MongoDatasetData.countDocuments({
    datasetId,
    'indexes.type': indexType
  });

  return count > 0;
}

/**
 * Validate that all given datasets have ready indexes for the target index type.
 *
 * @param datasetIds - Dataset IDs to validate (must be non-empty)
 * @param indexType - Target index type to validate
 * @throws {RerankTrainErrEnum.rerankValidationNoDatasetConfigured} If datasetIds is empty
 * @throws {RerankTrainErrEnum.rerankValidationDatasetNoSynthesisIndex} If any dataset has no target indexes
 */
export async function validateDatasetTargetIndexes(
  datasetIds: string[],
  indexType: `${DatasetDataIndexTypeEnum}`
): Promise<void> {
  if (datasetIds.length === 0) {
    return Promise.reject(RerankTrainErrEnum.rerankValidationNoDatasetConfigured);
  }

  addLog.info('Validating dataset target indexes', {
    datasetCount: datasetIds.length,
    datasetIds,
    indexType
  });

  const validationResults = await Promise.all(
    datasetIds.map(async (datasetId) => ({
      datasetId,
      hasIndexes: await hasReadyTargetIndexes(datasetId, indexType)
    }))
  );

  const invalidDatasets = validationResults.filter((r) => !r.hasIndexes);

  if (invalidDatasets.length > 0) {
    addLog.error('Dataset target index validation failed', {
      totalDatasets: datasetIds.length,
      invalidDatasets: invalidDatasets.length,
      invalidDatasetIds: invalidDatasets.map((d) => d.datasetId),
      indexType
    });
    return Promise.reject(RerankTrainErrEnum.rerankValidationDatasetNoSynthesisIndex);
  }

  addLog.info('Dataset target index validation successful', {
    validatedDatasets: datasetIds.length,
    indexType
  });
}
