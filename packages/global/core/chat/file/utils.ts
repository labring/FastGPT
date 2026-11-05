import {
  audioFileType,
  documentFileExtensions,
  imageFileType,
  videoFileType
} from '../../../common/file/constants';
import { parseFilenameExtension } from '../../../common/string/tools';
import { ChatFileTypeEnum } from '../constants';

const extensionTypes: [readonly string[], ChatFileTypeEnum][] = [
  [imageFileType.split(',').map((item) => item.trim()), ChatFileTypeEnum.image],
  [audioFileType.split(',').map((item) => item.trim()), ChatFileTypeEnum.audio],
  [videoFileType.split(',').map((item) => item.trim()), ChatFileTypeEnum.video],
  [documentFileExtensions, ChatFileTypeEnum.document]
];

/** 按真实文件名后缀分类；文档范围与现有解析器一致，缺少或不支持的后缀统一为 unknown。 */
export const getChatFileTypeByFilename = (filename = ''): ChatFileTypeEnum => {
  const extension = `.${parseFilenameExtension(filename)}`;
  return (
    extensionTypes.find(([extensions]) => extensions.includes(extension))?.[1] ??
    ChatFileTypeEnum.unknown
  );
};

/**
 * 在历史记录、协议和文件变量输入边界统一归类旧 file、缺省或非法类型。
 * 显式 image/audio/video/document 优先；unknown、旧 file 和缺省类型继续按名称、URL 推测，不探测网络。
 */
export const normalizeChatFileType = ({
  type,
  filename,
  url
}: {
  type?: unknown;
  filename?: string;
  url?: string;
}): ChatFileTypeEnum => {
  if (isChatFileResolvedType(type)) return type;

  if (filename && !/^https?:\/\//i.test(filename) && parseFilenameExtension(filename))
    return getChatFileTypeByFilename(filename);
  try {
    const parsed = new URL(url || filename || '', 'http://localhost');
    const resolvedFilename =
      parsed.searchParams.get('filename')?.trim() || decodeURIComponent(parsed.pathname);
    return getChatFileTypeByFilename(resolvedFilename);
  } catch {
    return ChatFileTypeEnum.unknown;
  }
};

/** 只把图片、音频和视频交给模型的多模态通道，文档、未知文件及历史 file 均不属于媒体。 */
export const isChatFileMediaType = (
  type: unknown
): type is ChatFileTypeEnum.image | ChatFileTypeEnum.audio | ChatFileTypeEnum.video =>
  type === ChatFileTypeEnum.image ||
  type === ChatFileTypeEnum.audio ||
  type === ChatFileTypeEnum.video;

/** 可直接复用的明确分类；unknown、历史 file 和非法类型均需继续推测。 */
export const isChatFileResolvedType = (
  type: unknown
): type is Exclude<ChatFileTypeEnum, ChatFileTypeEnum.file | ChatFileTypeEnum.unknown> =>
  isChatFileMediaType(type) || type === ChatFileTypeEnum.document;
