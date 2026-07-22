import { parseUrlToChatFileType } from '../../chat/fileContext';

import { AsyncLocalStorage } from 'async_hooks';
import type { MCPClient } from '../../app/mcp';
import { isAbsoluteHttpUrl } from './fileContext';
import type { WorkflowFileContext, WorkflowFileInput, WorkflowFileRegistrar } from './fileContext';
import { readExternalFileBuffer } from '../../../common/file/read/external';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatFileStoreValue,
  ChatItemMiniType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';

type ContextType = {
  mcpClientMemory: Record<string, MCPClient>;
  fileContext?: WorkflowFileContext;
  fileRegistrar?: WorkflowFileRegistrar;
};

export const WorkflowContext = new AsyncLocalStorage<ContextType>();

export const runWithContext = <T>(value: ContextType, fn: (ctx: ContextType) => T): T =>
  WorkflowContext.run(value, () => {
    const store = WorkflowContext.getStore()!;
    return fn(store);
  });

export const getWorkflowContext = (): ContextType => {
  return WorkflowContext.getStore()!;
};

/** 获取当前 Workflow 调用链在入口创建的只读文件上下文。 */
export const getWorkflowFileContext = () => WorkflowContext.getStore()?.fileContext;

/** 获取只供 Workflow 输入适配器使用的文件登记能力。 */
export const getWorkflowFileRegistrar = () => WorkflowContext.getStore()?.fileRegistrar;

/** 收集 Child query/history 中实际携带的文件输入。 */
export const getWorkflowChatFileInputs = ({
  query = [],
  histories = []
}: {
  query?: UserChatItemValueItemType[];
  histories?: ChatItemMiniType[];
}): WorkflowFileInput[] => [
  ...query.flatMap((item) => (item.file ? [item.file] : [])),
  ...histories.flatMap((history) =>
    history.obj === ChatRoleEnum.Human
      ? history.value.flatMap((item) => ('file' in item && item.file ? [item.file] : []))
      : []
  )
];

/**
 * 使用 Child 实际文件输入派生隔离 Context，并在该异步调用链内执行 Child。
 * Child 交互新增文件会通过父 registrar 鉴权，再同步加入当前派生 Context。
 */
export const runWithDerivedWorkflowFileContext = async <T>({
  files,
  fn
}: {
  files: WorkflowFileInput[];
  fn: (scope: {
    resolveInputFile?: (file: ChatFileStoreValue) => Promise<string | undefined>;
  }) => Promise<T>;
}): Promise<T> => {
  const parentStore = WorkflowContext.getStore();
  const parentFileContext = parentStore?.fileContext;
  if (!parentStore || !parentFileContext) return fn({});

  const maxFileAmount = Math.max(parentFileContext.limits.maxFileAmount, 0);
  const seenFileIdentities = new Set<string>();
  const truncatedFileIdentities = new Set<string>();
  const selectedFiles: WorkflowFileInput[] = [];

  const getFileIdentity = (file: WorkflowFileInput) => {
    const parentRef =
      typeof file === 'string'
        ? parentFileContext.resolve(file)
        : parentFileContext.resolveInputFile(file);

    if (parentRef) return parentFileContext.getIdentity(parentRef.modelUrl);
    if (typeof file === 'string') return `url:${file}`;
    if ('key' in file && typeof file.key === 'string') return `key:${file.key}`;
    if (typeof file.url === 'string') return `url:${file.url}`;
  };

  // 同一文件可能同时来自 query、变量和节点输入，去重后再计算 Workflow 容量。
  for (const file of files) {
    const identity = getFileIdentity(file);
    if (identity && seenFileIdentities.has(identity)) continue;
    if (identity) seenFileIdentities.add(identity);

    if (selectedFiles.length >= maxFileAmount) {
      if (identity) truncatedFileIdentities.add(identity);
      continue;
    }

    selectedFiles.push(file);
  }
  let childFileContext = parentFileContext.derive(selectedFiles);
  const childStore: ContextType = {
    ...parentStore,
    fileContext: childFileContext,
    fileRegistrar: undefined
  };

  const resolveInputFile = async (file: ChatFileStoreValue) => {
    const ref = childFileContext.resolveInputFile(file);
    if (ref) return ref.modelUrl;
    if (truncatedFileIdentities.has(getFileIdentity(file) ?? '')) return;
    throw new UserError('Child workflow file is not selected in its file context');
  };

  const childRegistrar: WorkflowFileRegistrar | undefined = parentStore.fileRegistrar
    ? {
        registerInputFile: async (params) => {
          const existingRef = childFileContext.resolveInputFile(params.file);
          if (existingRef) return existingRef;
          if (selectedFiles.length >= maxFileAmount) return;

          const ref = await parentStore.fileRegistrar!.registerInputFile(params);
          if (!ref) return;
          selectedFiles.push(ref.modelUrl);
          const currentParentFileContext = parentStore.fileContext ?? parentFileContext;
          childFileContext = currentParentFileContext.derive(selectedFiles);
          childStore.fileContext = childFileContext;
          return ref;
        }
      }
    : undefined;

  childStore.fileRegistrar = childRegistrar;

  return runWithContext(childStore, () => fn({ resolveInputFile }));
};

/** 优先读取已登记文件，未登记外链复用相同的 SSRF-safe reader 和 Workflow 大小限制。 */
export const readWorkflowFileBuffer = async ({ url }: { url: string }) => {
  const fileContext = getWorkflowFileContext();
  const ref = fileContext?.resolve(url);
  if (fileContext && ref) return (await fileContext.read(ref)).buffer;

  return (
    await readExternalFileBuffer({
      url,
      maxFileSize: fileContext?.limits.maxBytesPerFile
    })
  ).buffer;
};

export const updateWorkflowContextVal = (val: Partial<ContextType>) => {
  const context = getWorkflowContext();
  if (context) {
    for (const key in val) {
      // @ts-ignore
      context[key] = val[key];
    }
  }
};

/** 结合 workflow 运行态文件元数据，将 URL 解析成 ChatBox 文件结构。 */
export const parseUrlToFileType = (url: string) => {
  const fileContext = getWorkflowFileContext();
  const workflowFile = fileContext?.resolveChatFile(url);
  if (workflowFile) return workflowFile;
  if (fileContext && !isAbsoluteHttpUrl(url)) return;

  return parseUrlToChatFileType({ url });
};
