import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { isEqual } from 'lodash';
import type {
  FileSelectorInputObjectItemType,
  FileSelectorInputItemType,
  FileSelectorInputValueType,
  FileSelectorRenderItemType,
  FileSelectorValueItemType
} from './type';

const isFileObject = (file: FileSelectorInputItemType): file is FileSelectorInputObjectItemType =>
  !!file && typeof file === 'object';

/**
 *  移除无效的文件选择值
 */
export const sanitizeFileSelectValue = (
  value: FileSelectorInputValueType = []
): FileSelectorValueItemType[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map<FileSelectorValueItemType | undefined>((file) => {
      if (typeof file === 'string') {
        const trimmedFile = file.trim();
        if (!trimmedFile || trimmedFile.startsWith('data:')) return;

        return {
          url: trimmedFile,
          name: trimmedFile,
          type: ChatFileTypeEnum.file
        };
      }
      if (!isFileObject(file)) return;

      const key = file.key || undefined;
      const fileUrl = file.url;
      const url = fileUrl && !fileUrl.startsWith('data:') ? fileUrl : undefined;

      if (!key && !url) return;

      const baseFile = {
        ...(file.id ? { id: file.id } : {}),
        ...(file.name ? { name: file.name } : {}),
        ...(file.type ? { type: file.type } : {})
      };

      if (key) {
        return {
          ...baseFile,
          key
        };
      }

      if (url) {
        return {
          ...baseFile,
          url
        };
      }
    })
    .filter(Boolean) as FileSelectorValueItemType[];
};

export const isFileSelectorUploading = (
  file: Pick<FileSelectorRenderItemType, 'key' | 'url' | 'error' | 'process'>
) => !file.key && !file.url && !file.error && file.process !== undefined;

export const getFileSelectorDisplayIcon = (
  file: Pick<FileSelectorRenderItemType, 'type' | 'url' | 'icon' | 'name' | 'key'>
) => {
  const fallbackIcon = getFileIcon(file.name || file.key);

  if (file.type === ChatFileTypeEnum.image) {
    return file.url || file.icon || fallbackIcon;
  }

  return file.icon || fallbackIcon;
};

export const isFileSelectorCleanValueEcho = ({
  value,
  cleanedValue,
  lastEmittedValue
}: {
  value: FileSelectorInputValueType;
  cleanedValue: FileSelectorValueItemType[];
  lastEmittedValue?: FileSelectorValueItemType[];
}) => isEqual(cleanedValue, lastEmittedValue) && isEqual(value, cleanedValue);

export const markFileSelectorUploading = (files: FileSelectorRenderItemType[]) => {
  const uploadingFiles = files.filter((item) => item.status === 0);

  uploadingFiles.forEach((file) => {
    file.status = 1;
    file.process = 0;
    delete file.error;
  });

  return uploadingFiles;
};

export const markFileSelectorUploadSuccess = ({
  files,
  id,
  key,
  url
}: {
  files: FileSelectorRenderItemType[];
  id: string;
  key: string;
  url: string;
}) => {
  files.forEach((item) => {
    if (item.id === id) {
      item.url = url;
      item.key = key;
      delete item.process;
    }
  });
};

export const markFileSelectorUploadError = ({
  files,
  id,
  error
}: {
  files: FileSelectorRenderItemType[];
  id: string;
  error: string;
}) => {
  files.forEach((item) => {
    if (item.id === id) {
      item.error = error;
      delete item.process;
    }
  });
};
