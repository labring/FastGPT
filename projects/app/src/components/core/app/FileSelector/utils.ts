import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { imageFileType } from '@fastgpt/global/common/file/constants';
import { isEqual } from 'lodash-es';
import mime from 'mime';
import { parseContentDispositionFilename } from '@fastgpt/global/common/file/tools';
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
  value: FileSelectorInputValueType = [],
  retainPreviewUrl = false
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
          key,
          ...(retainPreviewUrl && url ? { url } : {})
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

export const hasFileSelectorError = (files: Pick<FileSelectorRenderItemType, 'error'>[]) =>
  files.some((file) => !!file.error);

/**
 * 外部表单值刷新时保留仅存在于组件内部的上传态。
 *
 * 待上传/上传失败文件尚无 key/url，不能进入持久化值；父表单因上传计数等状态重渲染时，
 * 仍需保留这些本地项，避免文件在上传完成前从列表中闪烁消失。
 */
export const mergeFileSelectorExternalValue = ({
  currentFiles,
  externalFiles
}: {
  currentFiles: FileSelectorRenderItemType[];
  externalFiles: FileSelectorRenderItemType[];
}) => {
  const localOnlyFiles = currentFiles.filter(
    (file) =>
      !file.key &&
      !file.url &&
      (!!file.rawFile || !!file.error || file.status === 0 || file.process !== undefined)
  );

  return localOnlyFiles.length > 0 ? [...localOnlyFiles, ...externalFiles] : externalFiles;
};

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

/**
 * 浏览器直接探测无文件名外链的展示文件名；有 filename 参数或带后缀的路径时不请求远端。
 * 只读 HEAD：通过已有 MIME 库推断后缀，或复用 Content-Disposition 的文件名解析。
 * 跨域拒绝、超时及未知元数据返回 undefined；结果仅用于 getFileIcon，不改写文件类型。
 * 使用 XHR 事件处理失败，避开部分浏览器扩展包装 fetch 时遗留的未处理 Promise 拒绝。
 */
export const probeFileSelectorLinkFilename = async ({
  url,
  signal
}: {
  url: string;
  signal: AbortSignal;
}): Promise<string | undefined> => {
  if (signal.aborted) return;
  const parsedUrl = (() => {
    try {
      return new URL(url);
    } catch {
      return;
    }
  })();
  if (!parsedUrl || !['http:', 'https:'].includes(parsedUrl.protocol)) return;

  const filename = (() => {
    const queryFilename = parsedUrl.searchParams.get('filename')?.trim();
    if (queryFilename) return queryFilename;
    const basename = parsedUrl.pathname.split('/').at(-1) ?? '';
    try {
      return decodeURIComponent(basename);
    } catch {
      return basename;
    }
  })();
  if (parsedUrl.searchParams.get('filename')?.trim() || filename.includes('.')) return filename;

  return new Promise<string | undefined>((resolve) => {
    let request: XMLHttpRequest | undefined;
    let finished = false;

    // 所有失败都 resolve 空值；解除事件监听，避免取消后的迟到响应再修改图标。
    const finish = (filename?: string) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', abort);
      if (request) {
        request.onload = null;
        request.onerror = null;
        request.ontimeout = null;
        request.onabort = null;
      }
      resolve(filename);
    };
    const abort = () => {
      finish();
      try {
        request?.abort();
      } catch {}
    };

    try {
      request = new XMLHttpRequest();
      request.open('HEAD', url, true);
      request.timeout = 3000;
      request.withCredentials = false;
      const xhr = request;
      xhr.onload = () => {
        try {
          if (signal.aborted || xhr.status < 200 || xhr.status >= 300) return finish();
          const contentType = xhr
            .getResponseHeader('Content-Type')
            ?.split(';')[0]
            .trim()
            .toLowerCase();
          const extension =
            contentType && contentType !== 'application/octet-stream'
              ? mime.getExtension(contentType)
              : undefined;
          finish(
            extension
              ? `file.${extension}`
              : parseContentDispositionFilename(
                  xhr.getResponseHeader('Content-Disposition') ?? undefined
                ) || undefined
          );
        } catch {
          finish();
        }
      };
      xhr.onerror = () => finish();
      xhr.ontimeout = () => finish();
      xhr.onabort = () => finish();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) return abort();
      xhr.send();
    } catch {
      abort();
    }
  });
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
 * 上传成功后补齐后端 key 和临时预览 URL。默认 emit 只保留 key，临时调试可保留预览 URL。
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
