import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { imageFileType } from '@fastgpt/global/common/file/constants';
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

const imageFileExtensions = imageFileType.split(',').map((item) => item.trim().toLowerCase());

export const inferFileSelectorType = (filename?: string): ChatFileTypeEnum => {
  const normalizedName = (() => {
    if (!filename) return '';

    try {
      return decodeURIComponent(new URL(filename).pathname).toLowerCase();
    } catch {
      return filename.split(/[?#]/)[0].toLowerCase();
    }
  })();
  const extension = normalizedName.match(/\.[^./\\]+$/)?.[0];

  return extension && imageFileExtensions.includes(extension)
    ? ChatFileTypeEnum.image
    : ChatFileTypeEnum.file;
};

/**
 * 清洗 FileSelector 对外输出的值。
 *
 * 组件内部会保留 rawFile、base64 icon、上传进度、错误等渲染态字段；
 * 对外只允许传递后端可存储的 key/url + name/type，避免 base64 被写入变量或表单值。
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
          type: inferFileSelectorType(trimmedFile)
        };
      }
      if (!isFileObject(file)) return;

      const key = file.key || undefined;
      const fileUrl = file.url;
      const url = fileUrl && !fileUrl.startsWith('data:') ? fileUrl : undefined;

      if (!key && !url) return;

      const baseFile = {
        name: file.name || file.key || file.url || '',
        type: file.type || inferFileSelectorType(file.name || file.key || url)
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
  file: Pick<FileSelectorRenderItemType, 'key' | 'url' | 'error' | 'process' | 'status' | 'rawFile'>
) =>
  !file.key &&
  !file.url &&
  !file.error &&
  (!!file.rawFile || file.status === 0 || file.process !== undefined);

export const isFileSelectorPreviewUrlMissing = <
  T extends Pick<FileSelectorRenderItemType, 'key' | 'url' | 'error'>
>(
  file: T
): file is T & { key: string; url?: undefined; error?: undefined } =>
  !!file.key && !file.url && !file.error;

/**
 * 统一生成预览区图标。
 * 图片优先使用可访问 URL；非图片使用文件名/URL/key 推断出的通用文件图标。
 */
export const getFileSelectorDisplayIcon = (
  file: Pick<FileSelectorRenderItemType, 'type' | 'url' | 'icon' | 'name' | 'key'>
) => {
  const fallbackIcon = getFileIcon(file.name || file.url || file.key);

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

/**
 * 将待上传文件从“已选中”推进到“上传中”，并返回这批需要真正上传的文件。
 */
export const markFileSelectorUploading = (files: FileSelectorRenderItemType[]) => {
  const uploadingFiles = files.filter((item) => item.status === 0);

  uploadingFiles.forEach((file) => {
    file.status = 1;
    file.process = 0;
    delete file.error;
  });

  return uploadingFiles;
};

/**
 * 上传成功后补齐后端 key 和临时预览 URL。后续 emit 时会由 sanitizeFileSelectValue 去掉预览 URL。
 */
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

/**
 * 上传失败只保留错误态，不再继续把该文件当作上传中。
 */
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
