import type { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { validateFileUrlDomain } from '../../../common/security/fileUrlValidator';
import {
  classifyUrlMediaType,
  type FileClassificationMediaType
} from '../../../common/file/classification';
import { getFileUrlIdentity, isAbsoluteHttpUrl, selectFileInputs } from './utils';

export type ChatFileInput = Pick<UserChatItemFileItemType, 'url'> &
  Partial<Pick<UserChatItemFileItemType, 'name' | 'type'>>;

/** filename 保存探测文件名（包含识别出的后缀），与调用方指定的显示名称 name 分离。 */
export type PreparedChatFile = UserChatItemFileItemType & { filename?: string };

export type FileProbeResult = Pick<PreparedChatFile, 'type' | 'filename'>;

/** 分类只依赖已登记元数据，不依赖工作流、权限校验或登记实现。 */
export type FileClassificationContext = {
  resolveChatFile: (url: string) => PreparedChatFile | undefined;
  getIdentity: (url: string) => string | undefined;
};

/** 上层可提供登记能力；只接收已分类文件，禁止在登记方法中再次推测类型。 */
export type FilePreparationContext = FileClassificationContext & {
  registerExternalFile?: (file: PreparedChatFile) => {
    name: string;
    type: ChatFileTypeEnum;
    modelUrl: string;
  };
};

/**
 * 唯一链接分类入口：已登记结果 > 显式 image/audio/video/document > 传入名称后缀 > 可信对象元数据 > 链接文件名 > 系统链接探测 > unknown。
 * 非 URL 的 name 有后缀时以它为准；缺少名称后缀时才使用链接与响应信息。
 * 链接包含 filename 参数或带后缀的路径文件名时不探测，文档归 document，未知后缀归 unknown；短链凭证不视为文件名。
 * file、unknown 和缺省类型继续推测；私有 key 不请求签名链接。
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
}): Promise<PreparedChatFile | undefined> => {
  if (typeof url !== 'string') return;
  const classified = await classifyUrlMediaType({
    url,
    name,
    type: type as FileClassificationMediaType | undefined,
    fileContext,
    metadata
  });

  if (!classified) return;

  const inferred: PreparedChatFile = {
    url: classified.url,
    name: classified.name,
    type: classified.type as ChatFileTypeEnum,
    ...(classified.filename ? { filename: classified.filename } : {})
  };

  // 分类入口已处理登记竞争；同类型复用原 Ref，保留其授权 key 等上下文。
  const latestRegistered = fileContext?.resolveChatFile(url);
  return latestRegistered?.type === inferred.type ? latestRegistered : inferred;
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
}): Promise<PreparedChatFile[]> => {
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
        return {
          name: ref.name,
          type: ref.type,
          url: ref.modelUrl,
          ...(result.filename ? { filename: result.filename } : {})
        };
      }
      const registered = fileContext?.resolveChatFile(file.url);
      if (registered) return { ...registered, type: result.type };
      return {
        name: result.name,
        type: result.type,
        url: result.url,
        ...(result.filename ? { filename: result.filename } : {})
      };
    },
    5
  );
  return parsed.filter((file): file is PreparedChatFile => file !== undefined);
};
