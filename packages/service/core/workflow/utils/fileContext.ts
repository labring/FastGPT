import { getAxiosHeaderValue } from '@fastgpt/global/common/axios/utils';
import { parseContentDispositionFilename } from '@fastgpt/global/common/file/tools';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatItemMiniType,
  UserChatItemFileItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { Readable } from 'node:stream';
import path from 'node:path';
import { axios } from '../../../common/api/axios';
import { getLogger, LogCategories } from '../../../common/logger';
import { S3Buckets } from '../../../common/s3/config/constants';
import { createChatFilePreviewUrlGetter } from '../../../common/s3/sources/chat';
import { isAuthorizedChatFileS3Key } from '../../../common/s3/sources/chat/key';
import type { ChatS3SourceType } from '../../../common/s3/sources/chat/type';
import { readStreamToBuffer } from '../../../common/s3/utils';
import { validateFileUrlDomain } from '../../../common/security/fileUrlValidator';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);
const WORKFLOW_FILE_URL_EXPIRED_HOURS = 2;
const WORKFLOW_FILE_DOWNLOAD_TIMEOUT_MS = 180_000;
const DEFAULT_WORKFLOW_FILE_MAX_SIZE = 2 * 1024 * 1024 * 1024;

export type WorkflowFileSource =
  | {
      type: 'chatObject';
      objectKey: string;
    }
  | {
      type: 'externalHttp';
      url: string;
    };

export type WorkflowFileRef = {
  id: string;
  name: string;
  type: ChatFileTypeEnum;
  modelUrl: string;
  source: WorkflowFileSource;
};

export type WorkflowFileLimits = {
  maxFiles: number;
  maxBytesPerFile: number;
};

export type WorkflowFileReadResult = {
  buffer: Buffer;
  filename: string;
  contentType?: string;
  sourceKind: 'internal' | 'external';
  imageParsePrefix?: string;
};

export type WorkflowFileContext = {
  limits: WorkflowFileLimits;
  resolve: (urlOrId: string) => WorkflowFileRef | undefined;
  resolveChatFile: (url: string) => UserChatItemFileItemType | undefined;
  getIdentity: (urlOrId: string) => string | undefined;
  read: (target: string | WorkflowFileRef) => Promise<WorkflowFileReadResult>;
};

export type WorkflowFileEntryScope = {
  sourceType: ChatS3SourceType;
  sourceId: string;
  uid: string;
  chatId: string;
};

type PrepareWorkflowFileContextParams = {
  query: UserChatItemValueItemType[];
  histories: ChatItemMiniType[];
  scope: WorkflowFileEntryScope;
  maxFiles: number;
  maxFileSize?: number;
  getPreviewUrl?: (key: string) => Promise<string>;
};

export type PreparedWorkflowFileContext = {
  fileContext: WorkflowFileContext;
  getPreviewUrl: (key: string) => Promise<string>;
};

/** 只接受带显式协议的绝对 HTTP(S) URL，拒绝相对路径和 protocol-relative URL。 */
export const isAbsoluteHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;

  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};

const getExternalIdentity = (url: string) => {
  const parsedUrl = new URL(url);
  parsedUrl.hash = '';
  return `external:${parsedUrl.toString()}`;
};

const getFileNameFromUrl = (url: string) => {
  try {
    return path.basename(decodeURIComponent(new URL(url).pathname)) || 'file';
  } catch {
    return 'file';
  }
};

const decodeMetadataFilename = (value?: string) => {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getChatImageParsePrefix = (objectKey: string) => {
  const extension = path.extname(objectKey);
  return `${objectKey.slice(0, extension ? -extension.length : undefined)}-parsed`;
};

const assertFileSize = ({ size, maxBytes }: { size: number | undefined; maxBytes: number }) => {
  if (size !== undefined && Number.isFinite(size) && size > maxBytes) {
    throw new UserError(`File exceeds maximum allowed size (${maxBytes} bytes)`);
  }
};

/**
 * 在 Workflow 请求入口校验并登记 query/history 文件。
 *
 * 私有 Ref 只能由归属根 Workflow 的 chat object key 创建；外链只接受绝对 HTTP(S)。
 * 返回的签名函数按 key 缓存，供 history 其他服务端文件引用复用同一个两小时 URL。
 */
export const prepareWorkflowFileContext = async ({
  query,
  histories,
  scope,
  maxFiles,
  maxFileSize = DEFAULT_WORKFLOW_FILE_MAX_SIZE,
  getPreviewUrl: getPreviewUrlInput = createChatFilePreviewUrlGetter({
    expiredHours: WORKFLOW_FILE_URL_EXPIRED_HOURS
  })
}: PrepareWorkflowFileContextParams): Promise<PreparedWorkflowFileContext> => {
  const byId = new Map<string, WorkflowFileRef>();
  const byRuntimeUrl = new Map<string, WorkflowFileRef>();
  const byIdentity = new Map<string, WorkflowFileRef>();
  const refIdentity = new WeakMap<WorkflowFileRef, string>();
  const previewUrlCache = new Map<string, Promise<string>>();

  const assertAuthorizedKey = (key: string) => {
    if (!isAuthorizedChatFileS3Key({ key, ...scope })) {
      throw new UserError('Workflow file key does not belong to the current workflow');
    }
  };

  const getPreviewUrl = async (key: string) => {
    assertAuthorizedKey(key);

    const cached = previewUrlCache.get(key);
    if (cached) return cached;

    const previewUrlPromise = getPreviewUrlInput(key).then((url) => {
      if (!isAbsoluteHttpUrl(url)) {
        throw new UserError('Workflow file URL must be an absolute HTTP(S) URL');
      }
      return url;
    });
    previewUrlCache.set(key, previewUrlPromise);
    return previewUrlPromise;
  };

  const registerFile = async ({
    file,
    source
  }: {
    file: UserChatItemFileItemType;
    source: 'query' | 'history';
  }) => {
    const originalUrl = file.url;
    const resolvedFile = await (async () => {
      if (file.key) {
        assertAuthorizedKey(file.key);
        const modelUrl = await getPreviewUrl(file.key);
        file.url = modelUrl;

        return {
          identity: `chat:${file.key}`,
          modelUrl,
          fileSource: {
            type: 'chatObject' as const,
            objectKey: file.key
          }
        };
      }

      if (!isAbsoluteHttpUrl(file.url) || !validateFileUrlDomain(file.url)) {
        if (source === 'query') {
          throw new UserError('Invalid workflow file URL');
        }
        logger.warn('Skip unavailable workflow history file', { url: file.url });
        return;
      }

      return {
        identity: getExternalIdentity(file.url),
        modelUrl: file.url,
        fileSource: {
          type: 'externalHttp' as const,
          url: file.url
        }
      };
    })();

    if (!resolvedFile) return;
    const { identity, modelUrl, fileSource } = resolvedFile;

    const existingRef = byIdentity.get(identity);
    if (existingRef) {
      byRuntimeUrl.set(modelUrl, existingRef);
      if (isAbsoluteHttpUrl(originalUrl)) byRuntimeUrl.set(originalUrl, existingRef);
      file.url = existingRef.modelUrl;
      return;
    }

    const ref: WorkflowFileRef = {
      id: `workflow-file-${getNanoid()}`,
      name:
        file.name ||
        (fileSource.type === 'chatObject'
          ? path.basename(fileSource.objectKey) || 'file'
          : getFileNameFromUrl(modelUrl)),
      type: file.type,
      modelUrl,
      source: fileSource
    };

    byId.set(ref.id, ref);
    byRuntimeUrl.set(modelUrl, ref);
    if (isAbsoluteHttpUrl(originalUrl)) byRuntimeUrl.set(originalUrl, ref);
    byIdentity.set(identity, ref);
    refIdentity.set(ref, identity);
  };

  for (const item of query) {
    if (item.file) await registerFile({ file: item.file, source: 'query' });
  }

  for (const history of histories) {
    if (history.obj !== ChatRoleEnum.Human) continue;
    for (const value of history.value) {
      if ('file' in value && value.file) {
        await registerFile({ file: value.file, source: 'history' });
      }
    }
  }

  const limits: WorkflowFileLimits = {
    maxFiles,
    maxBytesPerFile: maxFileSize
  };

  const resolve = (urlOrId: string) => byId.get(urlOrId) ?? byRuntimeUrl.get(urlOrId);

  const read = async (target: string | WorkflowFileRef): Promise<WorkflowFileReadResult> => {
    const ref = typeof target === 'string' ? resolve(target) : target;
    if (!ref || !refIdentity.has(ref)) {
      throw new UserError('Workflow file is not registered in the current context');
    }

    if (ref.source.type === 'chatObject') {
      const bucket = global.s3BucketMap?.[S3Buckets.private];
      if (!bucket) throw new Error('Private S3 bucket is not initialized');

      const metadata = await bucket.client.getObjectMetadata({ key: ref.source.objectKey });
      assertFileSize({ size: metadata?.contentLength, maxBytes: limits.maxBytesPerFile });

      const response = await bucket.client.downloadObject({ key: ref.source.objectKey });
      if (!response.body) throw new Error('Workflow file object has no body');

      return {
        buffer: await readStreamToBuffer({
          stream: response.body,
          maxBytes: limits.maxBytesPerFile,
          exceededMessage: `File exceeds maximum allowed size (${limits.maxBytesPerFile} bytes)`
        }),
        filename:
          decodeMetadataFilename(metadata?.metadata?.originFilename) ||
          ref.name ||
          path.basename(ref.source.objectKey),
        contentType: metadata?.contentType,
        sourceKind: 'internal',
        imageParsePrefix: getChatImageParsePrefix(ref.source.objectKey)
      };
    }

    const response = await axios.get<Readable>(ref.source.url, {
      responseType: 'stream',
      timeout: WORKFLOW_FILE_DOWNLOAD_TIMEOUT_MS,
      maxContentLength: limits.maxBytesPerFile
    });
    const contentLength = Number(getAxiosHeaderValue(response.headers['content-length']) || 0);
    if (contentLength > limits.maxBytesPerFile) {
      response.data.destroy();
      assertFileSize({ size: contentLength, maxBytes: limits.maxBytesPerFile });
    }
    const contentDisposition = getAxiosHeaderValue(response.headers['content-disposition']) || '';

    return {
      buffer: await readStreamToBuffer({
        stream: response.data,
        maxBytes: limits.maxBytesPerFile,
        exceededMessage: `File exceeds maximum allowed size (${limits.maxBytesPerFile} bytes)`
      }),
      filename:
        parseContentDispositionFilename(contentDisposition) ||
        ref.name ||
        getFileNameFromUrl(ref.source.url),
      contentType: getAxiosHeaderValue(response.headers['content-type']),
      sourceKind: 'external'
    };
  };

  return {
    getPreviewUrl,
    fileContext: {
      limits,
      resolve,
      resolveChatFile: (url) => {
        const ref = resolve(url);
        if (!ref) return;

        return {
          type: ref.type,
          name: ref.name,
          ...(ref.source.type === 'chatObject' ? { key: ref.source.objectKey } : {}),
          url: ref.modelUrl
        };
      },
      getIdentity: (urlOrId) => {
        const ref = resolve(urlOrId);
        return ref ? refIdentity.get(ref) : undefined;
      },
      read
    }
  };
};
