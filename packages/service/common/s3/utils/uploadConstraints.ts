import { documentFileType } from '@fastgpt/global/common/file/constants';
import {
  defaultFileExtensionTypes,
  type FileExtensionKeyType
} from '@fastgpt/global/core/app/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import type { UploadConstraintsInput, UploadConstraints } from '../contracts/type';
import {
  createUploadExtensionRulesFromFileSelectConfig,
  normalizeAllowedExtensions,
  normalizeFileExtension,
  parseAllowedExtensions
} from '../uploadPolicy/utils';
import { createUploadPolicy } from '../uploadPolicy/service';

const uploadConfigKeys: FileExtensionKeyType[] = [
  'canSelectFile',
  'canSelectImg',
  'canSelectVideo',
  'canSelectAudio',
  'canSelectCustomFileExtension'
];

export { normalizeAllowedExtensions, normalizeFileExtension, parseAllowedExtensions };

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

export const getUploadExtensionRulesFromFileSelectConfig =
  createUploadExtensionRulesFromFileSelectConfig;

export const createUploadConstraints = ({
  filename,
  uploadConstraints,
  contentType,
  declaredExtension,
  declaredFilename,
  source,
  size
}: {
  filename: string;
  uploadConstraints?: UploadConstraintsInput;
  contentType?: string;
  declaredExtension?: string;
  declaredFilename?: string;
  source?: 'local-file' | 'remote-url' | 'server-generated';
  size?: number;
}): UploadConstraints => {
  return createUploadPolicy({
    hint: {
      filename,
      ...(contentType ? { contentType } : {}),
      ...(declaredExtension ? { declaredExtension } : {}),
      ...(declaredFilename ? { declaredFilename } : {}),
      ...(source ? { source } : {}),
      ...(size ? { size } : {})
    },
    uploadConstraints
  });
};
