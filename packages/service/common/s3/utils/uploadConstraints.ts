import { documentFileType } from '@fastgpt/global/common/file/constants';
import {
  defaultFileExtensionTypes,
  type FileExtensionKeyType
} from '@fastgpt/global/core/app/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import type { UploadConstraintsInput, UploadConstraints } from '../contracts/type';
import { DEFAULT_CONTENT_TYPE, normalizeMimeType, resolveMimeType } from './mime';
import path from 'node:path';

const uploadConfigKeys: FileExtensionKeyType[] = [
  'canSelectFile',
  'canSelectImg',
  'canSelectVideo',
  'canSelectAudio',
  'canSelectCustomFileExtension'
];

export const normalizeFileExtension = (extension?: string) => {
  if (!extension) return '';

  const trimmedExtension = extension.trim().toLowerCase();
  if (!trimmedExtension) return '';

  return trimmedExtension.startsWith('.') ? trimmedExtension : `.${trimmedExtension}`;
};

export const normalizeAllowedExtensions = (extensions?: string[]) => {
  if (!extensions?.length) return [];

  return [...new Set(extensions.map(normalizeFileExtension).filter(Boolean))];
};

export const parseAllowedExtensions = (value: string) => {
  return normalizeAllowedExtensions(value.split(','));
};

export const avatarAllowedExtensions = normalizeAllowedExtensions(['.jpg', '.jpeg', '.png']);
export const datasetAllowedExtensions = parseAllowedExtensions(documentFileType);

export const getAllowedExtensionsFromFileSelectConfig = (config?: AppFileSelectConfigType) => {
  if (!config) return [];

  const extensions = uploadConfigKeys.flatMap((key) => {
    if (!config[key]) return [];

    if (key === 'canSelectCustomFileExtension') {
      return config.customFileExtensionList || [];
    }

    return defaultFileExtensionTypes[key];
  });

  return normalizeAllowedExtensions(extensions);
};

export const createUploadConstraints = ({
  filename,
  uploadConstraints
}: {
  filename: string;
  uploadConstraints?: UploadConstraintsInput;
}): UploadConstraints => {
  const allowedExtensions = normalizeAllowedExtensions(uploadConstraints?.allowedExtensions);
  const fileExtension = normalizeFileExtension(path.extname(filename));

  if (
    allowedExtensions.length > 0 &&
    (!fileExtension || !allowedExtensions.includes(fileExtension))
  ) {
    throw new Error(S3ErrEnum.invalidUploadFileType);
  }

  const defaultContentType = normalizeMimeType(
    uploadConstraints?.defaultContentType || resolveMimeType([filename], DEFAULT_CONTENT_TYPE),
    DEFAULT_CONTENT_TYPE
  );

  return {
    defaultContentType,
    ...(allowedExtensions.length > 0 ? { allowedExtensions } : {})
  };
};
