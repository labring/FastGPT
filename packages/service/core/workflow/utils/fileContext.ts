import { parseContentDispositionFilename } from '@fastgpt/global/common/file/tools';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatFileStoreValue,
  ChatItemMiniType,
  UserChatItemFileItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import path from 'node:path';
import { getFileMaxSize } from '../../../common/file/utils';
import { readExternalFileBuffer } from '../../../common/file/read/external';
import { getLogger, LogCategories } from '../../../common/logger';
import { S3Buckets } from '../../../common/s3/config/constants';
import { createChatFilePreviewUrlGetter } from '../../../common/s3/sources/chat';
import { isAuthorizedChatFileS3Key } from '../../../common/s3/sources/chat/key';
import type { ChatS3SourceType } from '../../../common/s3/sources/chat/type';
import { readStreamToBuffer } from '../../../common/s3/utils';
import { validateFileUrlDomain } from '../../../common/security/fileUrlValidator';
import { normalizeChatFileStoreValue, type RawChatFileValue } from '../../chat/fileStoreValue';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);
const WORKFLOW_FILE_URL_EXPIRED_HOURS = 2;

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
  resolveInputFile: (file: RawChatFileValue) => WorkflowFileRef | undefined;
  read: (target: string | WorkflowFileRef) => Promise<WorkflowFileReadResult>;
  derive: (files: WorkflowFileInput[]) => WorkflowFileContext;
};

export type WorkflowFileInput = string | RawChatFileValue;

export type WorkflowFileEntryScope = {
  sourceType: ChatS3SourceType;
  sourceId: string;
  uid: string;
  chatId: string;
};

export type WorkflowFileRegistrationSource = 'query' | 'history' | 'variable' | 'interactive';

export type WorkflowFileRegistrar = {
  registerInputFile: (params: {
    file: ChatFileStoreValue | UserChatItemFileItemType;
    source: WorkflowFileRegistrationSource;
  }) => Promise<WorkflowFileRef | undefined>;
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
  fileRegistrar: WorkflowFileRegistrar;
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
 * 根据 Child 实际文件输入创建隔离 Context。
 *
 * 父 Context 命中的文件继承其可信 Ref；未命中的绝对外链在 Child 内单独登记。
 * 私有 key 只能从父 Context 继承，禁止通过 URL 结构或未知 key 推断内部对象权限。
 */
const createDerivedWorkflowFileContext = ({
  parent,
  files
}: {
  parent: WorkflowFileContext;
  files: WorkflowFileInput[];
}): WorkflowFileContext => {
  const byId = new Map<string, WorkflowFileRef>();
  const byRuntimeUrl = new Map<string, WorkflowFileRef>();
  const byIdentity = new Map<string, WorkflowFileRef>();
  const refIdentity = new WeakMap<WorkflowFileRef, string>();
  const inheritedRefs = new WeakSet<WorkflowFileRef>();

  const addRef = ({
    ref,
    identity,
    aliases = [],
    inherited
  }: {
    ref: WorkflowFileRef;
    identity: string;
    aliases?: string[];
    inherited: boolean;
  }) => {
    const existingRef = byIdentity.get(identity);
    if (existingRef) {
      aliases.forEach((url) => byRuntimeUrl.set(url, existingRef));
      return existingRef;
    }

    byId.set(ref.id, ref);
    byRuntimeUrl.set(ref.modelUrl, ref);
    aliases.forEach((url) => byRuntimeUrl.set(url, ref));
    byIdentity.set(identity, ref);
    refIdentity.set(ref, identity);
    if (inherited) inheritedRefs.add(ref);
    return ref;
  };

  for (const file of files) {
    const inputUrl = typeof file === 'string' ? file : 'url' in file ? file.url : undefined;
    const parentRef =
      (inputUrl ? parent.resolve(inputUrl) : undefined) ||
      (typeof file === 'string' ? undefined : parent.resolveInputFile(file));

    if (parentRef) {
      const identity = parent.getIdentity(parentRef.id);
      if (!identity) throw new UserError('Parent workflow file identity is unavailable');
      addRef({
        ref: parentRef,
        identity,
        aliases: inputUrl && isAbsoluteHttpUrl(inputUrl) ? [inputUrl] : [],
        inherited: true
      });
      continue;
    }

    if (typeof file !== 'string' && 'key' in file && file.key) {
      throw new UserError('Child workflow private file is not registered in the parent context');
    }
    if (!isAbsoluteHttpUrl(inputUrl) || !validateFileUrlDomain(inputUrl)) {
      throw new UserError('Invalid child workflow file URL');
    }

    const storeValue = normalizeChatFileStoreValue(
      typeof file === 'string'
        ? { url: file }
        : {
            url: inputUrl,
            name: file.name,
            type: file.type
          }
    );
    if (!storeValue || !('url' in storeValue)) {
      throw new UserError('Invalid child workflow external file');
    }

    const identity = getExternalIdentity(storeValue.url);
    addRef({
      ref: {
        id: `workflow-file-${getNanoid()}`,
        name: storeValue.name,
        type: storeValue.type,
        modelUrl: storeValue.url,
        source: {
          type: 'externalHttp',
          url: storeValue.url
        }
      },
      identity,
      inherited: false
    });
  }

  const resolve = (urlOrId: string) => byId.get(urlOrId) ?? byRuntimeUrl.get(urlOrId);
  const resolveInputFile = (file: RawChatFileValue) => {
    const key = 'key' in file && typeof file.key === 'string' ? file.key : undefined;
    if (key) return byIdentity.get(`chat:${key}`);
    return typeof file.url === 'string' ? resolve(file.url) : undefined;
  };

  const fileContext: WorkflowFileContext = {
    limits: parent.limits,
    resolve,
    resolveInputFile,
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
    read: async (target) => {
      const ref = typeof target === 'string' ? resolve(target) : target;
      if (!ref || !refIdentity.has(ref)) {
        throw new UserError('Workflow file is not selected for the child context');
      }
      if (inheritedRefs.has(ref)) return parent.read(ref);
      if (ref.source.type !== 'externalHttp') {
        throw new UserError('Child workflow private file must be inherited from parent context');
      }

      const { buffer, contentType, contentDisposition } = await readExternalFileBuffer({
        url: ref.source.url,
        maxFileSize: parent.limits.maxBytesPerFile
      });
      return {
        buffer,
        filename:
          parseContentDispositionFilename(contentDisposition || '') ||
          ref.name ||
          getFileNameFromUrl(ref.source.url),
        contentType,
        sourceKind: 'external'
      };
    },
    derive: (childFiles) =>
      createDerivedWorkflowFileContext({ parent: fileContext, files: childFiles })
  };

  return fileContext;
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
  maxFileSize = getFileMaxSize(),
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

  const registerInputFile: WorkflowFileRegistrar['registerInputFile'] = async ({
    file,
    source
  }) => {
    const originalUrl = 'url' in file ? file.url : undefined;
    const fileKey =
      'key' in file && typeof file.key === 'string' && file.key ? file.key : undefined;
    const resolvedFile = await (async () => {
      if (fileKey) {
        if (source === 'history' && !isAuthorizedChatFileS3Key({ key: fileKey, ...scope })) {
          logger.warn('Skip unauthorized workflow history file', { key: fileKey });
          return;
        }
        assertAuthorizedKey(fileKey);
        const modelUrl = await getPreviewUrl(fileKey);
        if ('url' in file) file.url = modelUrl;

        return {
          identity: `chat:${fileKey}`,
          modelUrl,
          fileSource: {
            type: 'chatObject' as const,
            objectKey: fileKey
          }
        };
      }

      const fileUrl = 'url' in file ? file.url : undefined;
      if (!isAbsoluteHttpUrl(fileUrl) || !validateFileUrlDomain(fileUrl)) {
        if (source === 'query') {
          throw new UserError('Invalid workflow file URL');
        }
        if (source === 'history') {
          logger.warn('Skip unavailable workflow history file', { url: fileUrl });
          return;
        }
        throw new UserError(`Invalid workflow ${source} file URL`);
      }

      return {
        identity: getExternalIdentity(fileUrl),
        modelUrl: fileUrl,
        fileSource: {
          type: 'externalHttp' as const,
          url: fileUrl
        }
      };
    })();

    if (!resolvedFile) return;
    const { identity, modelUrl, fileSource } = resolvedFile;

    const existingRef = byIdentity.get(identity);
    if (existingRef) {
      byRuntimeUrl.set(modelUrl, existingRef);
      if (originalUrl && isAbsoluteHttpUrl(originalUrl)) {
        byRuntimeUrl.set(originalUrl, existingRef);
      }
      if ('url' in file) file.url = existingRef.modelUrl;
      return existingRef;
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
    return ref;
  };

  for (const item of query) {
    if (item.file) await registerInputFile({ file: item.file, source: 'query' });
  }

  for (const history of histories) {
    if (history.obj !== ChatRoleEnum.Human) continue;
    for (const value of history.value) {
      if ('file' in value && value.file) {
        await registerInputFile({ file: value.file, source: 'history' });
      }
    }
  }

  const limits: WorkflowFileLimits = {
    maxFiles,
    maxBytesPerFile: maxFileSize
  };

  const resolve = (urlOrId: string) => byId.get(urlOrId) ?? byRuntimeUrl.get(urlOrId);
  const resolveInputFile = (file: RawChatFileValue) => {
    const key = 'key' in file && typeof file.key === 'string' ? file.key : undefined;
    if (key) return byIdentity.get(`chat:${key}`);
    return typeof file.url === 'string' ? resolve(file.url) : undefined;
  };

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

    const { buffer, contentType, contentDisposition } = await readExternalFileBuffer({
      url: ref.source.url,
      maxFileSize: limits.maxBytesPerFile
    });

    return {
      buffer,
      filename:
        parseContentDispositionFilename(contentDisposition || '') ||
        ref.name ||
        getFileNameFromUrl(ref.source.url),
      contentType,
      sourceKind: 'external'
    };
  };

  const fileContext: WorkflowFileContext = {
    limits,
    resolve,
    resolveInputFile,
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
    read,
    derive: (files) => createDerivedWorkflowFileContext({ parent: fileContext, files })
  };

  return {
    getPreviewUrl,
    fileRegistrar: {
      registerInputFile
    },
    fileContext
  };
};
