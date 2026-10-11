import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import {
  audioFileType,
  imageFileType,
  videoFileType,
  documentFileExtensions
} from '@fastgpt/global/common/file/constants';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import path from 'node:path';
import pLimit from 'p-limit';
import { inferFileTypeFromUrl } from '../../../common/file/infer/service';
import { validateFileUrlDomain } from '../../../common/security/fileUrlValidator';
import { normalizeMimeType } from '../../../common/s3/utils/mime';
import { getFileUrlIdentity, isAbsoluteHttpUrl, selectFileInputs } from './utils';

export type ChatFileInput = Pick<UserChatItemFileItemType, 'url'> &
  Partial<Pick<UserChatItemFileItemType, 'name' | 'type'>>;

/** 分类只依赖已登记元数据，不依赖工作流、权限校验或登记实现。 */
export type FileClassificationContext = {
  resolveChatFile: (url: string) => UserChatItemFileItemType | undefined;
  getIdentity: (url: string) => string | undefined;
};

/** 上层可提供登记能力；只接收已分类文件，禁止在登记方法中再次推测类型。 */
export type FilePreparationContext = FileClassificationContext & {
  registerExternalFile?: (file: UserChatItemFileItemType) => {
    name: string;
    type: ChatFileTypeEnum;
    modelUrl: string;
  };
};

// 缓存随 Context 回收，不跨请求或父子 Context 共享未知文件，也不代表文件访问权限。
const classificationStates = new WeakMap<
  FileClassificationContext,
  {
    files: Map<string, Promise<ChatFileTypeEnum>>;
    probe: ReturnType<typeof pLimit>;
  }
>();
const probeWithoutContext = pLimit(5);

/**
 * 唯一链接分类入口：已登记结果 > 明确媒体类型 > 可信对象元数据 > 后缀 > 系统链接探测 > 普通文件。
 * 普通 file 提示仍允许探测；私有 key 只按后缀推测，不请求签名链接。
 * 分类不截断、不登记。Context 内相同身份复用探测和降级结果，远端探测并发上限为 5。
 */
export const parseUrlToChatFileType = async ({
  url,
  name,
  type,
  fileContext,
  metadata
}: ChatFileInput & {
  fileContext?: FileClassificationContext;
  /** 由上层验证过的对象元数据；短链使用真实 objectKey 和元数据，不探测签名 URL。 */
  metadata?: { filename?: string; contentType?: string };
}): Promise<UserChatItemFileItemType | undefined> => {
  if (typeof url !== 'string') return;
  const registered = fileContext?.resolveChatFile(url);
  if (registered) return registered;

  /** 对象元数据与 HTTP 响应头使用同一 MIME 规则。 */
  const mediaTypeFromMime = (contentType?: string) => {
    const mime = normalizeMimeType(contentType, '');
    if (mime.startsWith('image/')) return ChatFileTypeEnum.image;
    if (mime.startsWith('audio/')) return ChatFileTypeEnum.audio;
    if (mime.startsWith('video/')) return ChatFileTypeEnum.video;
  };

  /** 只缓存远端探测类型；调用方的文件名和显式类型不进入缓存，避免首次调用污染后续元数据。 */
  const probeType = (): Promise<ChatFileTypeEnum> => {
    const state = (() => {
      if (!fileContext) return;
      const existing = classificationStates.get(fileContext);
      if (existing) return existing;
      const created = {
        files: new Map<string, Promise<ChatFileTypeEnum>>(),
        probe: pLimit(5)
      };
      classificationStates.set(fileContext, created);
      return created;
    })();
    const identity = fileContext?.getIdentity(url) ?? getFileUrlIdentity(url);
    const cached = state?.files.get(identity);
    if (cached) return cached;

    const pending = (state?.probe ?? probeWithoutContext)(async () => {
      try {
        const { contentType } = await inferFileTypeFromUrl({
          url,
          validateUrl: validateFileUrlDomain
        });
        return mediaTypeFromMime(contentType) ?? ChatFileTypeEnum.file;
      } catch {
        // 系统探测失败时只降级类型，不授予读取权限；业务读取仍需通过独立校验。
      }
      return ChatFileTypeEnum.file;
    });
    state?.files.set(identity, pending);
    return pending;
  };

  /** 推测仅处理类型；请求层仍逐跳检查 SSRF 和域名白名单，避免重定向绕过输入校验。 */
  const infer = async (): Promise<UserChatItemFileItemType | undefined> => {
    if (url.startsWith('data:')) {
      const mime = url.match(/^data:([^;]+);base64,/)?.[1].toLowerCase();
      if (!mime?.startsWith('image/')) return;
      return { type: ChatFileTypeEnum.image, name: name || `image.${mime.split('/')[1]}`, url };
    }

    try {
      const parsedUrl = new URL(url, 'http://localhost:3000');
      const basename = path.basename(url.startsWith('chat/') ? url : parsedUrl.pathname);
      const filename =
        (url.startsWith('chat/') ? undefined : parsedUrl.searchParams.get('filename')) ||
        (basename.includes('.') ? basename : '');
      const extension = `.${filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()}`;
      const mediaExtensions: [string, ChatFileTypeEnum][] = [
        [imageFileType, ChatFileTypeEnum.image],
        [audioFileType, ChatFileTypeEnum.audio],
        [videoFileType, ChatFileTypeEnum.video]
      ];
      const filenameType = [path.extname(metadata?.filename ?? '').toLowerCase(), extension]
        .map(
          (candidate) =>
            mediaExtensions.find(([extensions]) =>
              extensions.split(',').some((item) => item.trim() === candidate)
            )?.[1]
        )
        .find((type) => type !== undefined);

      const resolvedType = await (async () => {
        if (type && type !== ChatFileTypeEnum.file) return type;
        const metadataType = mediaTypeFromMime(metadata?.contentType);
        if (metadataType) return metadataType;
        if (filenameType) return filenameType;
        if (
          documentFileExtensions.some((item) => item === extension) ||
          !isAbsoluteHttpUrl(url) ||
          !validateFileUrlDomain(url)
        )
          return ChatFileTypeEnum.file;
        return probeType();
      })();

      return {
        type: resolvedType,
        name: name || (filename ? decodeURIComponent(filename) : url),
        url
      };
    } catch {
      return { type: ChatFileTypeEnum.file, name: name || url, url };
    }
  };

  const inferred = await infer();
  // 探测期间其他入口可能已完成登记，不能把较早启动的推测覆盖到已登记结果上。
  return fileContext?.resolveChatFile(url) ?? inferred;
};

/** 校验外链准入；已授权 Ref 可使用自己的签名域名，不能据此放行其他外链。 */
export const validateChatFileInput = ({
  url,
  fileContext,
  allowDataUrl = false
}: {
  url: string;
  fileContext?: FileClassificationContext;
  allowDataUrl?: boolean;
}): boolean => {
  if (fileContext?.resolveChatFile(url)) return true;
  if (allowDataUrl && url.startsWith('data:')) return true;
  if (!isAbsoluteHttpUrl(url)) return false;
  if (!validateFileUrlDomain(url)) throw new UserError('Invalid file URL domain');
  return true;
};

/**
 * 文件准备流程：身份去重和截断 → 准入校验 → 统一分类 → 登记。
 * 额度由调用方指定；超限输入不校验、不探测、不登记，分类本身不产生登记副作用。
 */
export const prepareChatFiles = async ({
  files,
  maxFiles,
  fileContext,
  allowDataUrl = false
}: {
  files: ChatFileInput[];
  maxFiles: number;
  fileContext?: FilePreparationContext;
  allowDataUrl?: boolean;
}): Promise<UserChatItemFileItemType[]> => {
  const selected = selectFileInputs({
    files: files
      .filter((file) => typeof file.url === 'string' && file.url.trim())
      .map((file) => ({ ...file, url: file.url.trim() })),
    maxFiles,
    getIdentity: ({ url }) => fileContext?.getIdentity(url) ?? getFileUrlIdentity(url)
  });
  const accepted = selected.filter(({ url }) =>
    validateChatFileInput({ url, fileContext, allowDataUrl })
  );
  const parsed = await batchRun(
    accepted,
    async (file) => {
      const result = await parseUrlToChatFileType({ ...file, fileContext });
      if (!result) return;
      if (
        fileContext?.registerExternalFile &&
        !fileContext.resolveChatFile(file.url) &&
        isAbsoluteHttpUrl(result.url)
      ) {
        const ref = fileContext.registerExternalFile(result);
        return { ...result, name: ref.name, type: ref.type, url: ref.modelUrl };
      }
      return fileContext?.resolveChatFile(file.url) ?? result;
    },
    5
  );
  return parsed.filter((file): file is UserChatItemFileItemType => file !== undefined);
};
