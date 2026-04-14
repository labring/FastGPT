import { MongoDatasetData } from '../../../dataset/data/schema';
import { addLog } from '../../../../common/system/log';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';

/**
 * Check if a dataset has ready synthesis indexes
 * A dataset is considered ready if it has at least one data entry with synthesis indexes
 *
 * @param datasetId - Dataset ID to check
 * @returns True if dataset has ready synthesis indexes
 */
async function hasReadySynthesisIndexes(datasetId: string): Promise<boolean> {
  const count = await MongoDatasetData.countDocuments({
    datasetId,
    'indexes.type': DatasetDataIndexTypeEnum.synthesis
  });

  return count > 0;
}

/**
 * Validate that all given datasets have ready synthesis indexes for embedding training
 *
 * @param datasetIds - Dataset IDs to validate (must be non-empty)
 * @throws {EmbeddingTrainErrEnum.validationNoDatasetConfigured} If datasetIds is empty
 * @throws {EmbeddingTrainErrEnum.validationDatasetNoSynthesisIndex} If any dataset has no synthesis indexes
 */
export async function validateDatasetSynthesisIndexes(datasetIds: string[]): Promise<void> {
  if (datasetIds.length === 0) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingValidationNoDatasetConfigured);
  }

  addLog.info('Validating dataset synthesis indexes', {
    datasetCount: datasetIds.length,
    datasetIds
  });

  const validationResults = await Promise.all(
    datasetIds.map(async (datasetId) => ({
      datasetId,
      hasIndexes: await hasReadySynthesisIndexes(datasetId)
    }))
  );

  const invalidDatasets = validationResults.filter((r) => !r.hasIndexes);

  if (invalidDatasets.length > 0) {
    addLog.error('Dataset synthesis index validation failed', {
      totalDatasets: datasetIds.length,
      invalidDatasets: invalidDatasets.length,
      invalidDatasetIds: invalidDatasets.map((d) => d.datasetId)
    });
    return Promise.reject(EmbeddingTrainErrEnum.embeddingValidationDatasetNoSynthesisIndex);
  }

  addLog.info('Dataset synthesis index validation successful', {
    validatedDatasets: datasetIds.length
  });
}
