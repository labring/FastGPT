import { MongoDatasetData } from '../../../dataset/data/schema';
import { extractDatasetIdsFromApp } from '../utils';
import { addLog } from '../../../../common/system/log';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import type { AppSchema } from '@fastgpt/global/core/app/type';

/**
 * Dataset validation for rerank training task creation
 *
 * Validates that all dataset synthesis indexes are ready before creating a training task.
 * Throws error codes directly instead of returning validation results.
 */

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
 * Validate dataset synthesis indexes for training
 * Checks that all datasets associated with the app have ready synthesis indexes
 *
 * @param app - Application document
 * @param datasetIds - Optional specific dataset IDs to validate (if not provided, extracts from app)
 * @throws {RerankTrainErrEnum.validationNoDatasetConfigured} If no datasets configured in app
 * @throws {RerankTrainErrEnum.validationDatasetNoSynthesisIndex} If any dataset has no synthesis indexes
 */
export async function validateDatasetSynthesisIndexes(
  app: AppSchema,
  datasetIds?: string[]
): Promise<void> {
  const targetDatasetIds = datasetIds?.length ? datasetIds : extractDatasetIdsFromApp(app);

  if (targetDatasetIds.length === 0) {
    addLog.error('No datasets found for training validation', { appId: String(app._id) });
    return Promise.reject(RerankTrainErrEnum.validationNoDatasetConfigured);
  }

  addLog.info('Validating dataset synthesis indexes', {
    appId: String(app._id),
    datasetCount: targetDatasetIds.length,
    datasetIds: targetDatasetIds
  });

  // Validate each dataset
  const validationResults = await Promise.all(
    targetDatasetIds.map(async (datasetId) => {
      const hasIndexes = await hasReadySynthesisIndexes(datasetId);
      return {
        datasetId,
        hasIndexes
      };
    })
  );

  // Check for datasets without synthesis indexes
  const invalidDatasets = validationResults.filter((result) => !result.hasIndexes);

  if (invalidDatasets.length > 0) {
    const invalidDatasetIds = invalidDatasets.map((d) => d.datasetId);

    addLog.error('Dataset synthesis index validation failed', {
      appId: String(app._id),
      totalDatasets: targetDatasetIds.length,
      invalidDatasets: invalidDatasetIds.length,
      invalidDatasetIds
    });

    return Promise.reject(RerankTrainErrEnum.validationDatasetNoSynthesisIndex);
  }

  addLog.info('Dataset synthesis index validation successful', {
    appId: String(app._id),
    validatedDatasets: targetDatasetIds.length
  });
}
