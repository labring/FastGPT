import { audioFileType, imageFileType, videoFileType } from '@fastgpt/global/common/file/constants';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatFileStoreValue } from '@fastgpt/global/core/chat/type';
import path from 'path';

export type RawChatFileValue = {
  key?: string;
  url?: string;
  name?: string;
  type?: ChatFileTypeEnum;
};

/**
 * 前端或历史数据里的文件对象可能携带预览态、上传态等额外字段。
 * 这里允许 object 是为了让 `ChatFileValueInput` 表达“可清洗输入”，实际落库前会被裁剪。
 */
type ChatFileInputFieldValue = string | number | boolean | object | null | undefined;

/**
 * 文件变量的外部输入形态。
 *
 * 业务上只关心 key/url/name/type，但历史数据、插件表单和前端上传组件可能带入额外字段。
 * 后续统一通过 `parseRawChatFileValue` 白名单提取，避免把临时状态或渲染字段写入 chat variables。
 */
export type ChatFileValueInput = {
  key?: string;
  url?: string;
  name?: string;
  type?: ChatFileTypeEnum;
  [key: string]: ChatFileInputFieldValue;
};

/**
 * 工作流运行时的 file 变量形态。
 *
 * string 表示节点运行期直接可访问的 URL；对象表示从前端/API/历史变量传入的文件描述。
 * 持久化时不会直接保存运行时 URL，而是尽量还原成 `ChatFileStoreValue`。
 */
export type ChatFileRuntimeValueItem = string | RawChatFileValue;
export type ChatFileRuntimeValue = ChatFileRuntimeValueItem[];

/**
 * 判断值是否是可解析的文件对象，数组和空值不参与文件存储清洗。
 *
 * 只要包含 key、url 或明确的文件 type，就认为它可能是历史/前端传入的文件对象。
 * 真正可落库的最小字段会在 normalize 阶段再次校验，保证这里不会误写无效对象。
 */
const isChatFileValueInput = (value: unknown): value is ChatFileValueInput =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  value !== null &&
  (typeof (value as ChatFileValueInput).key === 'string' ||
    typeof (value as ChatFileValueInput).url === 'string' ||
    (value as ChatFileValueInput).type === ChatFileTypeEnum.image ||
    (value as ChatFileValueInput).type === ChatFileTypeEnum.audio ||
    (value as ChatFileValueInput).type === ChatFileTypeEnum.video ||
    (value as ChatFileValueInput).type === ChatFileTypeEnum.file);

/**
 * 从前端/历史文件对象中只读取文件存储需要的字段。
 *
 * 这是文件变量的第一层清洗：只保留 key/url/name/type，丢弃上传进度、预览地址、
 * 前端组件状态等临时字段。type 只接受聊天文件枚举，其他值交给后续扩展名推断。
 */
const parseRawChatFileValue = (file: ChatFileValueInput): RawChatFileValue => {
  return {
    key: typeof file.key === 'string' ? file.key : undefined,
    url: typeof file.url === 'string' ? file.url : undefined,
    name: typeof file.name === 'string' ? file.name : undefined,
    type:
      file.type === ChatFileTypeEnum.image ||
      file.type === ChatFileTypeEnum.audio ||
      file.type === ChatFileTypeEnum.video ||
      file.type === ChatFileTypeEnum.file
        ? file.type
        : undefined
  };
};

/**
 * 校验工作流文件运行值必须是数组，并保留 string URL 或可识别文件对象。
 *
 * 工作流节点约定 file 变量运行态是数组，数组项可以是 URL 字符串或文件对象。
 * 不可识别的对象会被过滤；非数组直接抛错，让变量类型错误尽早暴露给调用方。
 */
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

/**
 * 归一化单个文件存储值，确保 key/url 二选一且不会把 data URL 落库。
 *
 * 存储态只支持两类文件：
 * - `{ key, name, type }`：FastGPT 私有桶文件，运行时会重新签发临时预览 URL。
 * - `{ url, name, type }`：外部可访问 URL，运行时直接复用 URL。
 *
 * 如果同时存在 key 和 url，优先保存 key，因为 key 可以保持私有桶权限、TTL 和回收语义；
 * data URL 只适合作为短期运行态内容，体积大且不可追踪，所以这里直接过滤。
 */
export const normalizeChatFileStoreValue = (
  file: RawChatFileValue
): ChatFileStoreValue | undefined => {
  /** 从文件名推断聊天文件类型，无法识别时统一兜底为普通文件。 */
  const inferChatFileType = (filename: string): ChatFileTypeEnum => {
    const extname = path.extname(filename).toLowerCase();
    if (!extname) return ChatFileTypeEnum.file;

    if (imageFileType.includes(extname)) return ChatFileTypeEnum.image;
    if (audioFileType.includes(extname)) return ChatFileTypeEnum.audio;
    if (videoFileType.includes(extname)) return ChatFileTypeEnum.video;
    return ChatFileTypeEnum.file;
  };

  /**
   * 从 S3 object key 中提取稳定文件名。
   * key 是私有桶里的对象路径，落库时保留 key，展示名只用于 UI 和类型兜底推断。
   */
  const inferChatFileNameFromKey = (key: string) => path.basename(key) || 'file';

  /**
   * 从外部 URL pathname 中提取文件名，非法 URL 则保留原始字符串。
   *
   * 外链 URL 可能是用户/API 直接传入的完整地址；如果不能按标准 URL 解析，仍保留原值，
   * 避免因为名称推断失败导致整个文件变量被丢弃。
   */
  const inferChatFileNameFromUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return path.basename(decodeURIComponent(urlObj.pathname)) || url;
    } catch {
      return url;
    }
  };

  const key = file.key || undefined;
  const rawUrl = file.url || undefined;
  // data URL 可能来自多模态节点或前端预览，不能作为长期变量值写入数据库。
  const url = rawUrl && !rawUrl.startsWith('data:') ? rawUrl : undefined;

  if (!key && !url) return;

  const rawName = file.name || undefined;
  const rawType = file.type;

  if (key) {
    const name = rawName || inferChatFileNameFromKey(key);
    return {
      key,
      name,
      // 用户显式传入的 type 优先；缺省时按展示名/对象 key 的扩展名推断。
      type: rawType || inferChatFileType(name)
    };
  }

  const storeUrl = url as string;
  const name = rawName || inferChatFileNameFromUrl(storeUrl);
  return {
    url: storeUrl,
    name,
    type: rawType || inferChatFileType(name)
  };
};

/**
 * 批量归一化文件存储值，过滤非法项和前端渲染字段。
 *
 * 聊天保存、变量初始化等入口都可以复用这个函数，把宽松输入收敛成数据库允许的
 * `ChatFileStoreValue[]`。默认对非法整体输入返回空数组，兼容历史数据；需要在 API
 * 或工作流边界强校验时可通过 `throwOnInvalid` 抛出明确错误。
 */
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
