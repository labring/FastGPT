import { imageFileType } from '@fastgpt/global/common/file/constants';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatFileStoreValue } from '@fastgpt/global/core/chat/type';
import path from 'path';

export type RawChatFileValue = {
  key?: string;
  url?: string;
  name?: string;
  type?: ChatFileTypeEnum;
};

type ChatFileInputFieldValue = string | number | boolean | object | null | undefined;

export type ChatFileValueInput = {
  key?: string;
  url?: string;
  name?: string;
  type?: ChatFileTypeEnum;
  [key: string]: ChatFileInputFieldValue;
};

export type ChatFileRuntimeValueItem = string | RawChatFileValue;
export type ChatFileRuntimeValue = ChatFileRuntimeValueItem[];

/** 根据文件名扩展名判断是否按图片类型处理。 */
const isImageFilename = (filename?: string) => {
  if (!filename) return false;
  return imageFileType.includes(path.extname(filename).toLowerCase());
};

/** 从文件名推断聊天文件类型，无法识别时统一兜底为普通文件。 */
const inferChatFileType = (filename?: string): ChatFileTypeEnum =>
  isImageFilename(filename) ? ChatFileTypeEnum.image : ChatFileTypeEnum.file;

/** 从 S3 object key 中提取稳定文件名。 */
const inferChatFileNameFromKey = (key: string) => path.basename(key) || 'file';

/** 从外部 URL pathname 中提取文件名，非法 URL 则保留原始字符串。 */
const inferChatFileNameFromUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    return path.basename(decodeURIComponent(urlObj.pathname)) || url;
  } catch {
    return url;
  }
};

/** 判断值是否是可解析的文件对象，数组和空值不参与文件存储清洗。 */
const isChatFileValueInput = (value: unknown): value is ChatFileValueInput =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  value !== null &&
  (typeof (value as ChatFileValueInput).key === 'string' ||
    typeof (value as ChatFileValueInput).url === 'string' ||
    (value as ChatFileValueInput).type === ChatFileTypeEnum.image ||
    (value as ChatFileValueInput).type === ChatFileTypeEnum.file);

/** 从前端/历史文件对象中只读取文件存储需要的字段。 */
export const parseRawChatFileValue = (file: ChatFileValueInput): RawChatFileValue => {
  return {
    key: typeof file.key === 'string' ? file.key : undefined,
    url: typeof file.url === 'string' ? file.url : undefined,
    name: typeof file.name === 'string' ? file.name : undefined,
    type:
      file.type === ChatFileTypeEnum.image || file.type === ChatFileTypeEnum.file
        ? file.type
        : undefined
  };
};

/** 校验工作流文件运行值必须是数组，并保留 string URL 或可识别文件对象。 */
export const assertChatFileRuntimeValue = (
  value: ChatFileRuntimeValueItem[]
): ChatFileRuntimeValue => {
  if (!Array.isArray(value)) {
    throw new Error('File variable value must be an array');
  }
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      return isChatFileValueInput(item) ? parseRawChatFileValue(item) : undefined;
    })
    .filter((item): item is ChatFileRuntimeValueItem => Boolean(item));
};

/** 归一化单个文件存储值，确保 key/url 二选一且不会把 data URL 落库。 */
export const normalizeChatFileStoreValue = (
  file: RawChatFileValue
): ChatFileStoreValue | undefined => {
  const key = file.key || undefined;
  const rawUrl = file.url || undefined;
  const url = rawUrl && !rawUrl.startsWith('data:') ? rawUrl : undefined;

  if (!key && !url) return;

  const rawName = file.name || undefined;
  const rawType = file.type;

  if (key) {
    const name = rawName || inferChatFileNameFromKey(key);
    return {
      key,
      name,
      type: rawType || inferChatFileType(name || key)
    };
  }

  if (url) {
    const name = rawName || inferChatFileNameFromUrl(url);
    return {
      url,
      name,
      type: rawType || inferChatFileType(name)
    };
  }
};

/** 批量归一化文件存储值，过滤非法项和前端渲染字段。 */
export const normalizeChatFileStoreValues = (
  value: ChatFileValueInput[],
  options?: { throwOnInvalid?: boolean }
): ChatFileStoreValue[] => {
  if (!Array.isArray(value)) {
    if (options?.throwOnInvalid) {
      throw new Error('File variable value must be an array');
    }
    return [];
  }

  return value
    .map((file) => {
      if (!isChatFileValueInput(file)) return;
      return normalizeChatFileStoreValue(parseRawChatFileValue(file));
    })
    .filter((file): file is ChatFileStoreValue => Boolean(file));
};
