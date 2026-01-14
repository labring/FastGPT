import { MongoDatasetCollection } from './schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import DatasetErrorCode from '@fastgpt/global/common/error/code/dataset';

/**
 * Validate collection name when updating
 * Checks for:
 * 1. Duplicate names in the same dataset
 * 2. File extension removal (not allowed)
 * 3. File extension mismatch with original
 */
export const validateCollectionNameUpdate = async ({
  collectionId,
  datasetId,
  newName,
  originalName,
  collectionType
}: {
  collectionId: string;
  datasetId: string;
  newName: string;
  originalName: string;
  collectionType: DatasetCollectionTypeEnum;
}) => {
  // Only validate file type collections
  if (collectionType !== DatasetCollectionTypeEnum.file) {
    return;
  }

  // Extract file extensions
  const getFileExtension = (filename: string): string => {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';
  };

  const originalExt = getFileExtension(originalName);
  const newExt = getFileExtension(newName);

  // Check 1: File extension cannot be removed
  if (originalExt && !newExt) {
    return Promise.reject(DatasetErrEnum.collectionNameMissingExtension);
  }

  // Check 2: File extension must match original
  if (originalExt && newExt && originalExt !== newExt) {
    const errorObj = DatasetErrorCode[DatasetErrEnum.collectionNameExtensionMismatch];
    return Promise.reject({
      ...errorObj,
      message: errorObj.message.replace('{{original}}', originalExt).replace('{{new}}', newExt)
    });
  }

  // Check 3: No duplicate names in the same dataset
  // Note: 不检查 parentId，在整个 dataset 范围内检查重名，确保文件名全局唯一
  const existingCollection = await MongoDatasetCollection.findOne({
    datasetId,
    name: newName,
    type: DatasetCollectionTypeEnum.file,
    _id: { $ne: collectionId } // Exclude current collection
  });

  if (existingCollection) {
    // Return error with the duplicate file name
    const errorObj = DatasetErrorCode[DatasetErrEnum.collectionNameDuplicate];
    return Promise.reject({
      ...errorObj,
      message: errorObj.message.replace('{{fileName}}', newName)
    });
  }
};
