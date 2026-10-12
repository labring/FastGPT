import { UserError } from '@fastgpt/global/common/error/utils';
import { type ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatFileStoreValue,
  ChatItemMiniType,
  UserChatItemFileItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import path from 'node:path';
import { getFileMaxSize } from '../../../common/file/utils';
import type { FileSource } from '../../../common/file/read/source';
import { createExternalHttpFileSource, createS3FileSource } from '../../../common/file/read/source';
import { getLogger, LogCategories } from '../../../common/logger';
import { S3Buckets } from '../../../common/s3/config/constants';
import { createChatFilePreviewUrlGetter } from '../../../common/s3/sources/chat';
import { isAuthorizedChatFileS3Key } from '../../../common/s3/sources/chat/key';
import type { ChatS3SourceType } from '../../../common/s3/sources/chat/type';
import { validateFileUrlDomain } from '../../../common/security/fileUrlValidator';
import type { RawChatFileValue } from '../../chat/fileStoreValue';
import {
  parseUrlToChatFileType,
  prepareChatFiles,
  type ChatFileInput,
  type PreparedChatFile
} from '../../chat/file/service';
import { isAbsoluteHttpUrl, getFileUrlIdentity, getFileNameFromUrl } from '../../chat/file/utils';
import { filterWorkflowQueryFiles, type WorkflowFileLimits } from './fileLimits';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);
const WORKFLOW_FILE_URL_EXPIRED_HOURS = 2;

export type WorkflowFileLocator =
  | {
      type: 'chatObject';
      objectKey: string;
    }
  | {
      type: 'externalHttp';
      url: string;
    };

export type WorkflowFileRef = {
  name: string;
  /** 探测文件名（包含识别出的后缀），供链接读取选择解析格式；不覆盖显式显示名称。 */
  filename?: string;
  type: ChatFileTypeEnum;
  modelUrl: string;
  source: WorkflowFileLocator;
};

export type WorkflowFileSourceResult = {
  source: FileSource;
  sourceKind: 'internal' | 'external';
  imageParsePrefix?: string;
};

export type WorkflowFileContext = {
  limits: WorkflowFileLimits;
  resolve: (url: string) => WorkflowFileRef | undefined;
  resolveChatFile: (url: string) => PreparedChatFile | undefined;
  getIdentity: (url: string) => string | undefined;
  resolveInputFile: (file: RawChatFileValue) => WorkflowFileRef | undefined;
  getSource: (target: string | WorkflowFileRef) => Promise<WorkflowFileSourceResult>;
  /** 只登记已分类外链；输入准备通过 prepareChatFiles 完成。 */
  registerExternalFile: (file: PreparedChatFile) => WorkflowFileRef;
  derive: (files: WorkflowFileInput[]) => Promise<WorkflowFileContext>;
};

export type WorkflowFileInput = string | RawChatFileValue;

export type WorkflowFileEntryScope = {
  sourceType: ChatS3SourceType;
  sourceId: string;
  uid: string;
  chatId: string;
};

export type WorkflowFileRegistrationSource =
  | 'query'
  | 'history'
  | 'variable'
  | 'interactive'
  | 'plugin';

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
  maxFileAmount: number;
  maxBytesPerFile?: number;
  getPreviewUrl?: (key: string) => Promise<string>;
};

export type PreparedWorkflowFileContext = {
  fileContext: WorkflowFileContext;
  fileRegistrar: WorkflowFileRegistrar;
  getPreviewUrl: (key: string) => Promise<string>;
  query: UserChatItemValueItemType[];
  histories: ChatItemMiniType[];
};

/**
 * 根和 Child 共用的文件登记表。每次创建独立索引，相同 identity 始终复用首个 Ref。
 * 统一维护 URL 别名、私有 key 查询和聊天文件转换；仅接收上层已授权/已分类的 Ref，
 * 不负责鉴权、网络探测或父子继承，避免登记表扩大文件可见范围。
 */
const createWorkflowFileRegistry = () => {
  const byRuntimeUrl = new Map<string, WorkflowFileRef>();
  const byIdentity = new Map<string, WorkflowFileRef>();
  const refIdentity = new WeakMap<WorkflowFileRef, string>();

  const register = ({
    ref,
    identity,
    aliases = []
  }: {
    ref: WorkflowFileRef;
    identity: string;
    aliases?: string[];
  }) => {
    const registered = byIdentity.get(identity) ?? ref;
    byIdentity.set(identity, registered);
    refIdentity.set(registered, identity);
    byRuntimeUrl.set(registered.modelUrl, registered);
    aliases.forEach((url) => byRuntimeUrl.set(url, registered));
    return registered;
  };
  const resolve = (url: string) => byRuntimeUrl.get(url) ?? byIdentity.get(getFileUrlIdentity(url));
  const resolveInputFile = (file: RawChatFileValue) => {
    const key = 'key' in file && typeof file.key === 'string' ? file.key : undefined;
    // 私有 key 优先，不能通过冲突 URL 回退到另一份授权文件。
    if (key) return byIdentity.get(`chat:${key}`);
    return typeof file.url === 'string' ? resolve(file.url) : undefined;
  };
  const resolveChatFile = (url: string): PreparedChatFile | undefined => {
    const ref = resolve(url);
    if (!ref) return;
    return {
      type: ref.type,
      name: ref.name,
      ...(ref.filename ? { filename: ref.filename } : {}),
      ...(ref.source.type === 'chatObject' ? { key: ref.source.objectKey } : {}),
      url: ref.modelUrl
    };
  };
  const getIdentity = (url: string) => {
    const ref = resolve(url);
    return ref ? refIdentity.get(ref) : undefined;
  };
  /** 外链已经过准备流程校验与分类；这里只同步登记，不创建私有文件权限。 */
  const registerExternalFile: WorkflowFileContext['registerExternalFile'] = (file) =>
    register({
      ref: {
        name: file.name || getFileNameFromUrl(file.url) || 'file',
        ...(file.filename ? { filename: file.filename } : {}),
        type: file.type,
        modelUrl: file.url,
        source: { type: 'externalHttp', url: file.url }
      },
      identity: getFileUrlIdentity(file.url),
      aliases: [file.url]
    });

  return {
    register,
    getByIdentity: (identity: string) => byIdentity.get(identity),
    hasRef: (ref: WorkflowFileRef) => refIdentity.has(ref),
    context: { resolve, resolveInputFile, resolveChatFile, getIdentity, registerExternalFile }
  };
};

/** 优先采用带有效后缀的显示名称，否则复用探测文件名；均无格式时允许下载响应补充。 */
const createWorkflowExternalFileSource = ({
  url,
  name,
  filename: inferredFilename,
  maxSizeBytes
}: {
  url: string;
  name: string;
  filename?: string;
  maxSizeBytes: number;
}) => {
  const displayFilename = isAbsoluteHttpUrl(name)
    ? (getFileNameFromUrl(name) ?? 'file')
    : name || getFileNameFromUrl(url) || 'file';
  const displayExtension = path.extname(displayFilename);
  const filename =
    displayExtension && displayExtension !== '.'
      ? displayFilename
      : inferredFilename || displayFilename;
  const extension = path.extname(filename);
  return createExternalHttpFileSource({
    url,
    maxSizeBytes,
    // 无后缀名称不提供解析格式，允许 Content-Disposition 补充；Ref 的显示名称保持不变。
    trustMetadataFilename: Boolean(extension && extension !== '.'),
    metadata: { filename }
  });
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

/**
 * 根据 Child 实际文件输入创建隔离 Context。
 *
 * 父 Context 命中的文件继承其可信 Ref；未命中的绝对外链以最多 5 并发在 Child 内准备。
 * Parent 进程提前准备的文件可登记在 Parent，Child 仅继承此次选中的输入。
 * 私有 key 只能从父 Context 继承，禁止通过 URL 结构或未知 key 推断内部对象权限。
 */
const createDerivedWorkflowFileContext = async ({
  parent,
  files
}: {
  parent: WorkflowFileContext;
  files: WorkflowFileInput[];
}): Promise<WorkflowFileContext> => {
  const registry = createWorkflowFileRegistry();
  const inheritedRefs = new WeakSet<WorkflowFileRef>();
  const { resolve } = registry.context;

  const fileContext: WorkflowFileContext = {
    limits: parent.limits,
    ...registry.context,
    getSource: async (target) => {
      const ref = typeof target === 'string' ? resolve(target) : target;
      if (!ref || !registry.hasRef(ref)) {
        throw new UserError('Workflow file is not selected for the child context');
      }
      if (inheritedRefs.has(ref)) return parent.getSource(ref);
      if (ref.source.type !== 'externalHttp') {
        throw new UserError('Child workflow private file must be inherited from parent context');
      }

      return {
        source: createWorkflowExternalFileSource({
          url: ref.source.url,
          maxSizeBytes: parent.limits.maxBytesPerFile,
          name: ref.name,
          filename: ref.filename
        }),
        sourceKind: 'external'
      };
    },
    derive: (childFiles) =>
      createDerivedWorkflowFileContext({ parent: fileContext, files: childFiles })
  };

  // 先完成继承与准入校验，再批量准备新外链，避免逐文件等待网络。
  const externalFiles: ChatFileInput[] = [];
  for (const file of files) {
    const inputUrl = typeof file === 'string' ? file : 'url' in file ? file.url : undefined;
    const fileKey =
      typeof file === 'string' || !('key' in file) || typeof file.key !== 'string'
        ? undefined
        : file.key;
    // key 是私有文件的可信身份。对象携带 key 时不能用冲突 URL 降级命中父 Ref。
    const parentRef =
      fileKey && typeof file !== 'string'
        ? parent.resolveInputFile(file)
        : inputUrl
          ? parent.resolve(inputUrl)
          : undefined;

    if (parentRef) {
      const identity = parent.getIdentity(parentRef.modelUrl);
      if (!identity) throw new UserError('Parent workflow file identity is unavailable');
      const inheritedRef = registry.register({
        ref: parentRef,
        identity,
        aliases: inputUrl && isAbsoluteHttpUrl(inputUrl) ? [inputUrl] : []
      });
      inheritedRefs.add(inheritedRef);
      continue;
    }

    if (fileKey) {
      throw new UserError('Child workflow private file is not registered in the parent context');
    }
    if (!isAbsoluteHttpUrl(inputUrl) || !validateFileUrlDomain(inputUrl)) {
      throw new UserError('Invalid child workflow file URL');
    }

    externalFiles.push({
      url: inputUrl,
      ...(typeof file !== 'string' ? { name: file.name, type: file.type } : {})
    });
  }

  // 上层已选择 Child 输入；统一准备内部按身份去重，并以最多 5 并发完成分类和登记。
  await prepareChatFiles({ files: externalFiles, maxFiles: externalFiles.length, fileContext });
  return fileContext;
};

/**
 * 在 Workflow 请求入口校验并登记 query/history 文件。
 *
 * 私有 Ref 只能由归属根 Workflow 的 chat object key 创建；外链只接受绝对 HTTP(S)。
 * 返回新的运行态 query/histories，不修改调用方数据；签名函数按 key 缓存，供其它历史文件引用复用。
 */
export const prepareWorkflowFileContext = async ({
  query,
  histories,
  scope,
  maxFileAmount,
  maxBytesPerFile = getFileMaxSize(),
  getPreviewUrl: getPreviewUrlInput = createChatFilePreviewUrlGetter({
    expiredHours: WORKFLOW_FILE_URL_EXPIRED_HOURS
  })
}: PrepareWorkflowFileContextParams): Promise<PreparedWorkflowFileContext> => {
  const registry = createWorkflowFileRegistry();
  const { resolve } = registry.context;
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
        throw new Error('Workflow file signer must return an absolute HTTP(S) URL');
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
        identity: getFileUrlIdentity(fileUrl),
        modelUrl: fileUrl,
        fileSource: {
          type: 'externalHttp' as const,
          url: fileUrl
        }
      };
    })();

    if (!resolvedFile) return;
    const { identity, modelUrl, fileSource } = resolvedFile;

    const aliases = [modelUrl, ...(isAbsoluteHttpUrl(originalUrl) ? [originalUrl] : [])];
    const existingRef = registry.getByIdentity(identity);
    if (existingRef) return registry.register({ ref: existingRef, identity, aliases });

    if (fileSource.type === 'externalHttp') {
      const [parsed] = await prepareChatFiles({
        files: [{ url: modelUrl, name: file.name, type: file.type }],
        maxFiles: 1,
        fileContext
      });
      return parsed ? resolve(parsed.url) : undefined;
    }

    // 私有文件按可信 key 推断，不对签名下载链接发起外部 HEAD 请求。
    const parsedFile = await parseUrlToChatFileType({
      url: fileSource.objectKey,
      type: file.type,
      name: file.name,
      fileContext
    });
    // register 同步复用首个 Ref，覆盖类型推断期间另一调用已完成登记的情况。
    return registry.register({
      ref: {
        name: file.name || path.basename(fileSource.objectKey) || 'file',
        type: parsedFile?.type ?? file.type,
        modelUrl,
        source: fileSource
      },
      identity,
      aliases
    });
  };

  const prepareFile = async (
    file: UserChatItemFileItemType,
    source: 'query' | 'history'
  ): Promise<UserChatItemFileItemType | undefined> => {
    const ref = await registerInputFile({ file, source });
    if (ref)
      return {
        ...file,
        name: ref.name,
        type: ref.type,
        ...('url' in file ? { url: ref.modelUrl } : {})
      };
  };

  const limits: WorkflowFileLimits = {
    maxFileAmount,
    maxBytesPerFile
  };

  const getSource = async (target: string | WorkflowFileRef): Promise<WorkflowFileSourceResult> => {
    const ref = typeof target === 'string' ? resolve(target) : target;
    if (!ref || !registry.hasRef(ref)) {
      throw new UserError('Workflow file is not registered in the current context');
    }

    if (ref.source.type === 'chatObject') {
      const bucket = global.s3BucketMap?.[S3Buckets.private];
      if (!bucket) throw new Error('Private S3 bucket is not initialized');
      const objectKey = ref.source.objectKey;

      const metadata = await bucket.client.getObjectMetadata({ key: objectKey });
      const sizeBytes = metadata?.contentLength;
      if (typeof sizeBytes !== 'number' || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
        throw new Error('Workflow file object has invalid metadata');
      }
      const filename =
        decodeMetadataFilename(metadata.metadata?.originFilename) ||
        ref.name ||
        path.basename(objectKey);

      return {
        source: createS3FileSource({
          sizeBytes,
          metadata: {
            filename,
            contentType: metadata.contentType
          },
          getStream: async (signal) => {
            const response = await bucket.client.downloadObject({
              key: objectKey,
              abortSignal: signal
            });
            if (!response.body) throw new Error('Workflow file object has no body');
            return response.body;
          }
        }),
        sourceKind: 'internal',
        imageParsePrefix: getChatImageParsePrefix(objectKey)
      };
    }

    return {
      source: createWorkflowExternalFileSource({
        url: ref.source.url,
        maxSizeBytes: limits.maxBytesPerFile,
        name: ref.name,
        filename: ref.filename
      }),
      sourceKind: 'external'
    };
  };

  const fileContext: WorkflowFileContext = {
    limits,
    ...registry.context,
    getSource,
    derive: (files) => createDerivedWorkflowFileContext({ parent: fileContext, files })
  };

  const preparedQuery: UserChatItemValueItemType[] = await Promise.all(
    filterWorkflowQueryFiles({ query, maxFileAmount }).map(async (item) => {
      if (!item.file) return { ...item };

      const file = await prepareFile(item.file, 'query');
      if (!file) throw new UserError('Workflow query file is unavailable');
      return { ...item, file };
    })
  );
  const preparedHistories: ChatItemMiniType[] = await Promise.all(
    histories.map(async (history) => {
      if (history.obj !== ChatRoleEnum.Human) return { ...history };
      const selectedValues = filterWorkflowQueryFiles({
        query: history.value,
        maxFileAmount
      });
      const value = await Promise.all(
        selectedValues.map(async (value) => {
          if (!value.file) {
            return { ...value };
          }

          const file = await prepareFile(value.file, 'history');
          return file ? { ...value, file } : undefined;
        })
      );

      return {
        ...history,
        value: value.filter((item): item is NonNullable<typeof item> => item !== undefined)
      } as ChatItemMiniType;
    })
  );

  return {
    getPreviewUrl,
    fileRegistrar: {
      registerInputFile
    },
    fileContext,
    query: preparedQuery,
    histories: preparedHistories
  };
};
