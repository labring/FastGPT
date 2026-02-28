import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

/**
 * Validate collection name when updating
 * Checks for:
 * 1. File extension removal (not allowed)
 * 2. File extension mismatch with original
 * Note: Duplicate name checking is handled separately at the folder level
 */
export const validateCollectionNameUpdate = async ({
  newName,
  originalName,
  collectionType
}: {
  collectionId?: string; // Kept for backward compatibility, not used internally
  datasetId?: string; // Kept for backward compatibility, not used internally
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
    return Promise.reject(DatasetErrEnum.collectionNameExtensionMismatch);
  }
};
