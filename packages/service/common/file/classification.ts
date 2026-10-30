import path from 'node:path';
import pLimit from 'p-limit';
import { parseFilenameExtension } from '@fastgpt/global/common/string/tools';
import { isHttpUrl } from '@fastgpt/global/common/string/url';
import { audioFileType, imageFileType, videoFileType } from '@fastgpt/global/common/file/constants';
import { inferFileTypeFromUrl } from './infer/service';
import { validateFileUrlDomain } from '../security/fileUrlValidator';
import { verifyS3DownloadAccess } from '../s3/accessLink/downloadAlias/service';
import { S3SignedDownloadAliasValueSchema } from '../s3/accessLink/type';
import { normalizeMimeType } from '../s3/utils/mime';

export type FileClassificationMediaType = 'image' | 'audio' | 'video' | 'file';

export type FileProbeResult = {
  type: FileClassificationMediaType;
  filename?: string;
};

export type ClassifiedFileItem = {
  type: FileClassificationMediaType;
  name: string;
  url: string;
  filename?: string;
};

/** 分类上下文接口：调用方可通过此接口提供已解析的结果或自定义去重标识。 */
export type FileClassificationContext = {
  resolveFile?: (url: string) => FileProbeResult | undefined;
  /** 兼容上层业务已登记的文件上下文。 */
  resolveChatFile?: (url: string) => { type: string; filename?: string; name?: string } | undefined;
  getIdentity?: (url: string) => string | undefined;
};

/** 区分下载短链凭证与真实文件名；只检查格式，不验证签名或授予访问权限。 */
const isSignedDownloadAlias = (value: string) =>
  S3SignedDownloadAliasValueSchema.safeParse(value).success;

/**
 * 从 URL 路径解码并提取文件名，不读取 filename 查询参数或探测远端元数据。
 * 非法 URL、路径解码失败或没有文件名时返回 undefined。
 */
const getFileNameFromUrl = (url: string): string | undefined => {
  try {
    return path.basename(decodeURIComponent(new URL(url).pathname)) || undefined;
  } catch {
    return;
  }
};

/** 只接受显式 HTTP(S) 协议的绝对链接，排除相对路径和不完整的 URL。 */
const isAbsoluteHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !isHttpUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** 外链忽略 fragment，但保留查询参数（包括签名）；非外链保留原始身份。 */
const getFileUrlIdentity = (url: string): string => {
  if (!isAbsoluteHttpUrl(url)) return url;
  const parsed = new URL(url);
  parsed.hash = '';
  return `external:${parsed.toString()}`;
};

const mediaExtensions: [string, FileClassificationMediaType][] = [
  [imageFileType, 'image'],
  [audioFileType, 'audio'],
  [videoFileType, 'video']
];

/** 根据文件扩展名匹配图片、音频、视频媒体分类。 */
const matchMediaExtension = (candidate?: string): FileClassificationMediaType | undefined => {
  const ext = parseFilenameExtension(candidate);
  if (!ext) return;
  return mediaExtensions.find(([extensions]) =>
    extensions.split(',').some((item) => item.trim() === `.${ext}`)
  )?.[1];
};

/** 对象元数据与 HTTP 响应头使用同一 MIME 规则判断媒体分类。 */
const mediaTypeFromMime = (contentType?: string): FileClassificationMediaType | undefined => {
  const mime = normalizeMimeType(contentType, '');
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
};

/**
 * 创建通用媒体分类上下文，提供单次请求或 Agent 运行内的探测结果缓存。
 * 缓存随 Context 回收，不跨请求共享。
 */
export const createFileClassificationContext = (): FileClassificationContext => ({
  resolveFile: () => undefined,
  getIdentity: getFileUrlIdentity
});

// 缓存随 Context 回收，不跨请求或父子 Context 共享未知文件。
const classificationStates = new WeakMap<
  object,
  {
    files: Map<string, Promise<FileProbeResult>>;
    probe: ReturnType<typeof pLimit>;
  }
>();
const probeWithoutContext = pLimit(5);

/**
 * 通用 URL 媒体类型分类入口：
 * 规则优先级：已登记结果 > 明确媒体类型 > 可信对象元数据 > 链接扩展名 > 短链与系统链接探测 > 普通文件降级。
 *
 * 仅负责媒体类型识别与探测结果缓存，不产生文件登记副作用，不依赖具体业务层。
 */
export const classifyUrlMediaType = async ({
  url,
  name,
  type,
  fileContext,
  metadata
}: {
  url: string;
  name?: string;
  type?: FileClassificationMediaType;
  fileContext?: FileClassificationContext;
  metadata?: { filename?: string; contentType?: string };
}): Promise<ClassifiedFileItem | undefined> => {
  if (typeof url !== 'string') return;
  const registered = fileContext?.resolveFile?.(url) ?? fileContext?.resolveChatFile?.(url);
  if (registered) {
    return {
      type: registered.type as FileClassificationMediaType,
      name:
        name ||
        registered.filename ||
        ('name' in registered && registered.name ? registered.name : url),
      url,
      ...(registered.filename ? { filename: registered.filename } : {})
    };
  }

  /** 缓存远端类型和文件名；调用方的显示名称和显式类型不进入缓存，避免相互污染。 */
  const probeFile = (signedAlias?: string): Promise<FileProbeResult> => {
    const state = (() => {
      if (!fileContext) return;
      const existing = classificationStates.get(fileContext);
      if (existing) return existing;
      const created = {
        files: new Map<string, Promise<FileProbeResult>>(),
        probe: pLimit(5)
      };
      classificationStates.set(fileContext, created);
      return created;
    })();
    const identity = fileContext?.getIdentity?.(url) ?? getFileUrlIdentity(url);
    const cached = state?.files.get(identity);
    if (cached) return cached;

    const pending = (state?.probe ?? probeWithoutContext)(async (): Promise<FileProbeResult> => {
      if (signedAlias) {
        try {
          const access = await verifyS3DownloadAccess(signedAlias);
          if (access) {
            const objectBasename = path.basename(access.objectKey);
            const aliasFilename =
              access.filename || (objectBasename.includes('.') ? objectBasename : undefined);
            const aliasType =
              mediaTypeFromMime(access.responseContentType) ??
              matchMediaExtension(aliasFilename) ??
              // 显示名称可能没有后缀，不能遮蔽历史对象键中仍然有效的媒体后缀。
              matchMediaExtension(objectBasename);
            if (aliasType || aliasFilename) {
              return {
                type: aliasType ?? 'file',
                ...(aliasFilename && !isSignedDownloadAlias(aliasFilename)
                  ? { filename: aliasFilename }
                  : {})
              };
            }
          }
        } catch {
          // 非当前实例签发的短链或本地校验失败时，继续回退到远端 HTTP 探测。
        }
      }

      if (isAbsoluteHttpUrl(url) && validateFileUrlDomain(url)) {
        try {
          const { contentType, filename } = await inferFileTypeFromUrl({
            url,
            validateUrl: validateFileUrlDomain
          });
          return {
            type: mediaTypeFromMime(contentType) ?? 'file',
            // 探测端未返回文件名或格式证据时，不能继续把 URL 中的签名当作解析文件名。
            filename: isSignedDownloadAlias(filename) ? undefined : filename
          };
        } catch {
          // 系统探测失败时只降级类型，不授予读取权限；业务读取仍需通过独立校验。
        }
      }
      return { type: 'file' };
    });
    state?.files.set(identity, pending);
    return pending;
  };

  /** 推测补充类型和文件名；请求层仍逐跳检查 SSRF 和域名白名单，避免重定向绕过输入校验。 */
  const infer = async (): Promise<ClassifiedFileItem | undefined> => {
    if (url.startsWith('data:')) {
      if (type === 'audio' || type === 'video') {
        return { type, name: name || type, url };
      }
      const mime = url.match(/^data:([^;]+);base64,/)?.[1].toLowerCase();
      if (!mime?.startsWith('image/')) return;
      return { type: 'image', name: name || `image.${mime.split('/')[1]}`, url };
    }

    try {
      const parsedUrl = new URL(url, 'http://localhost:3000');
      const basename = url.startsWith('chat/')
        ? path.basename(url)
        : (getFileNameFromUrl(url) ?? path.basename(parsedUrl.pathname));
      const isShortAlias = isSignedDownloadAlias(basename);
      // 短链中的点号分隔 alias、过期时间与签名；交给响应元数据推测，不能作为已知后缀跳过探测。
      const filename = isShortAlias
        ? ''
        : (url.startsWith('chat/') ? undefined : parsedUrl.searchParams.get('filename')?.trim()) ||
          (basename.includes('.') ? basename : '');
      const filenameType = matchMediaExtension(metadata?.filename) ?? matchMediaExtension(filename);

      const resolved = await (async (): Promise<FileProbeResult> => {
        if (type && type !== 'file') return { type };
        const metadataType = mediaTypeFromMime(metadata?.contentType);
        if (metadataType) return { type: metadataType };
        if (filenameType) return { type: filenameType };
        if (filename || (!isShortAlias && (!isAbsoluteHttpUrl(url) || !validateFileUrlDomain(url))))
          return { type: 'file' };
        return probeFile(isShortAlias ? basename : undefined);
      })();

      return {
        type: resolved.type,
        ...(resolved.filename ? { filename: resolved.filename } : {}),
        // URL 路径和 query 已各自解码一次，避免把文件名中的字面量百分号再次解码。
        // 私有 key 保留原有显示名称兼容行为。
        name:
          name ||
          (filename ? (url.startsWith('chat/') ? decodeURIComponent(filename) : filename) : url),
        url
      };
    } catch {
      return { type: 'file', name: name || url, url };
    }
  };

  const inferred = await infer();
  const latestRegistered = fileContext?.resolveFile?.(url) ?? fileContext?.resolveChatFile?.(url);
  if (latestRegistered) {
    return {
      type: latestRegistered.type as FileClassificationMediaType,
      name:
        name ||
        latestRegistered.filename ||
        ('name' in latestRegistered && latestRegistered.name ? latestRegistered.name : url),
      url,
      ...(latestRegistered.filename ? { filename: latestRegistered.filename } : {})
    };
  }
  return inferred;
};
