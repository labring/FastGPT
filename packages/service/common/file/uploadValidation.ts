import { FileUploadError } from '@fastgpt/global/common/error/utils';
import {
  DEFAULT_FILE_UPLOAD_LIMITS,
  FileUploadErrorEnum
} from '@fastgpt/global/common/file/constants';
import type { FileType } from './multer';

export interface FileUploadLimits {
  maxFileCount?: number;
  maxFileSizeMB?: number;
  allowedTypes?: string[];
}

export interface FileValidationResult {
  isValid: boolean;
  errors: FileUploadError[];
  validFiles: FileType[];
  invalidFiles: FileType[];
}

/**
 * Get effective upload limits by merging global config with custom limits
 */
export function getEffectiveUploadLimits(
  customLimits?: FileUploadLimits
): Required<FileUploadLimits> {
  const globalLimits = {
    maxFileCount:
      global.feConfigs?.uploadFileMaxAmount ?? DEFAULT_FILE_UPLOAD_LIMITS.MAX_FILE_COUNT,
    maxFileSizeMB:
      global.feConfigs?.uploadFileMaxSize ?? DEFAULT_FILE_UPLOAD_LIMITS.MAX_FILE_SIZE_MB
  };

  return {
    maxFileCount: Math.min(
      customLimits?.maxFileCount ?? globalLimits.maxFileCount,
      globalLimits.maxFileCount
    ),
    maxFileSizeMB: Math.min(
      customLimits?.maxFileSizeMB ?? globalLimits.maxFileSizeMB,
      globalLimits.maxFileSizeMB
    ),
    allowedTypes: customLimits?.allowedTypes ?? []
  };
}

/**
 * Validate file size constraints
 */
export function validateFileSize(
  file: FileType,
  limits: Required<FileUploadLimits>
): FileUploadError | null {
  const maxSizeBytes = limits.maxFileSizeMB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    return new FileUploadError(
      FileUploadErrorEnum.FILE_TOO_LARGE,
      `File "${file.originalname}" exceeds the maximum file size limit of ${limits.maxFileSizeMB}MB`,
      {
        fileName: file.originalname,
        fileSize: file.size,
        maxSize: maxSizeBytes,
        maxSizeMB: limits.maxFileSizeMB
      }
    );
  }

  return null;
}

/**
 * Validate file count constraints
 */
export function validateFileCount(
  files: FileType[],
  limits: Required<FileUploadLimits>
): FileUploadError | null {
  if (files.length > limits.maxFileCount) {
    return new FileUploadError(
      FileUploadErrorEnum.TOO_MANY_FILES,
      `File count exceeds the limit, maximum ${limits.maxFileCount} files supported`,
      {
        fileCount: files.length,
        maxFileCount: limits.maxFileCount
      }
    );
  }

  return null;
}

/**
 * Validate file type constraints
 */
export function validateFileType(
  file: FileType,
  limits: Required<FileUploadLimits>
): FileUploadError | null {
  if (limits.allowedTypes.length === 0) {
    return null; // No type restrictions
  }

  const fileExtension = file.originalname
    .toLowerCase()
    .substring(file.originalname.lastIndexOf('.'));
  const isAllowed = limits.allowedTypes.some(
    (type) => type.toLowerCase() === fileExtension || file.mimetype.includes(type.toLowerCase())
  );

  if (!isAllowed) {
    return new FileUploadError(
      FileUploadErrorEnum.INVALID_FILE_TYPE,
      `File type not supported, file "${file.originalname}" has type ${fileExtension}`,
      {
        fileName: file.originalname,
        fileType: fileExtension,
        mimetype: file.mimetype,
        allowedTypes: limits.allowedTypes
      }
    );
  }

  return null;
}

export function validateFileUpload(
  files: FileType[],
  customLimits?: FileUploadLimits
): FileValidationResult {
  const limits = getEffectiveUploadLimits(customLimits);
  const errors: FileUploadError[] = [];
  const validFiles: FileType[] = [];
  const invalidFiles: FileType[] = [];

  const countError = validateFileCount(files, limits);
  if (countError) {
    errors.push(countError);
    return {
      isValid: false,
      errors,
      validFiles: [],
      invalidFiles: files
    };
  }

  for (const file of files) {
    const fileErrors: FileUploadError[] = [];

    const sizeError = validateFileSize(file, limits);
    if (sizeError) fileErrors.push(sizeError);

    const typeError = validateFileType(file, limits);
    if (typeError) fileErrors.push(typeError);

    if (fileErrors.length > 0) {
      errors.push(...fileErrors);
      invalidFiles.push(file);
    } else {
      validFiles.push(file);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    validFiles,
    invalidFiles
  };
}

export function formatUploadLimitsMessage(limits: Required<FileUploadLimits>): string {
  const messages = [
    `Maximum ${limits.maxFileCount} files supported`,
    `Maximum file size ${limits.maxFileSizeMB}MB`
  ];

  if (limits.allowedTypes.length > 0) {
    messages.push(`Supported file types: ${limits.allowedTypes.join(', ')}`);
  }

  return messages.join(', ');
}
