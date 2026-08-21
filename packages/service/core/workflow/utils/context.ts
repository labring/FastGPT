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

/** 获取 Workflow 内部无独立配置的统一文件数量上限。 */
export const getWorkflowFileMaxAmount = () => {
  const maxFileAmount = getWorkflowFileContext()?.limits.maxFileAmount;
  if (maxFileAmount === undefined) {
    throw new Error('Workflow file context is unavailable');
  }
  return maxFileAmount;
};

/** 获取只供 Workflow 输入适配器使用的文件登记能力。 */
export const getWorkflowFileRegistrar = () => WorkflowContext.getStore()?.fileRegistrar;

/**
 * 为 Child 运行创建独立的聊天输入引用。
 *
 * Child 不会修改这些输入，但在父子运行边界复制消息、value 及其常用嵌套字段，可以避免
 * 后续节点实现意外原地写入时污染 Parent 的 query/history。
 */
const cloneChildChatInputs = ({
  query,
  histories
}: {
  query: UserChatItemValueItemType[];
  histories: ChatItemMiniType[];
}) => {
  const cloneValue = <Value extends ChatItemMiniType['value'][number]>(value: Value): Value =>
    ({
      ...value,
      ...('text' in value && value.text ? { text: { ...value.text } } : {}),
      ...('file' in value && value.file ? { file: { ...value.file } } : {})
    }) as Value;

  return {
    query: query.map((item) => cloneValue(item)),
    histories: histories.map((history) => ({
      ...history,
      value: history.value.map((value) => cloneValue(value))
    })) as ChatItemMiniType[]
  };
};

/** 为 Child 返回独立的文件对象引用，字符串 URL 作为不可变值直接复用。 */
const cloneChildFile = (file: WorkflowFileInput): WorkflowFileInput =>
  typeof file === 'string' ? file : { ...file };

const cloneChildFiles = <File extends WorkflowFileInput>(files: File[]): File[] =>
  files.map((file) => cloneChildFile(file) as File);

/**
 * 先按父 Context 额度过滤 Child 的实际 query/history/其它文件输入，再派生隔离 Context。
 * Child 交互新增文件会通过父 registrar 鉴权，再同步加入当前派生 Context。
 */
export const runWithDerivedWorkflowFileContext = async <T>({
  query = [],
  histories = [],
  files,
  fn
}: {
  query?: UserChatItemValueItemType[];
  histories?: ChatItemMiniType[];
  files: WorkflowFileInput[];
  fn: (scope: {
    resolveInputFile?: (file: ChatFileStoreValue) => Promise<string | undefined>;
    query: UserChatItemValueItemType[];
    histories: ChatItemMiniType[];
    filterFiles: <File extends WorkflowFileInput>(files: File[]) => File[];
  }) => Promise<T>;
}): Promise<T> => {
  const parentStore = WorkflowContext.getStore();
  const parentFileContext = parentStore?.fileContext;
  if (!parentStore || !parentFileContext) {
    const childInputs = cloneChildChatInputs({ query, histories });
    return fn({
      ...childInputs,
      filterFiles: (files) => cloneChildFiles(files)
    });
  }

  const maxFileAmount = Math.max(parentFileContext.limits.maxFileAmount, 0);
  const seenFileIdentities = new Set<string>();
  const acceptedFileIdentities = new Set<string>();
  const rejectedFileIdentities = new Set<string>();
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

  const selectFile = (file: WorkflowFileInput) => {
    const identity = getFileIdentity(file);
    if (identity && seenFileIdentities.has(identity)) {
      return acceptedFileIdentities.has(identity);
    }
    if (identity) seenFileIdentities.add(identity);

    if (selectedFiles.length >= maxFileAmount) {
      if (identity) rejectedFileIdentities.add(identity);
      return false;
    }

    selectedFiles.push(file);
    if (identity) acceptedFileIdentities.add(identity);
    return true;
  };

  const selectedQuery = query.filter((item) => !item.file || selectFile(item.file));

  // 显式变量和节点输入优先于历史文件，避免旧历史占满 Child 的当前输入额度。
  files.forEach(selectFile);

  // 选择阶段从新到旧扫描历史；输出仍保持原有消息和值顺序。
  for (let historyIndex = histories.length - 1; historyIndex >= 0; historyIndex -= 1) {
    const history = histories[historyIndex];
    if (history.obj !== ChatRoleEnum.Human) continue;
    for (let valueIndex = history.value.length - 1; valueIndex >= 0; valueIndex -= 1) {
      const value = history.value[valueIndex];
      if ('file' in value && value.file) selectFile(value.file);
    }
  }

  const isSelectedFile = (file: WorkflowFileInput) => {
    const identity = getFileIdentity(file);
    return identity ? acceptedFileIdentities.has(identity) : false;
  };
  const selectedHistories = histories.map((history) =>
    history.obj === ChatRoleEnum.Human
      ? {
          ...history,
          value: history.value.filter(
            (value) => !('file' in value) || !value.file || isSelectedFile(value.file)
          )
        }
      : history
  );
  const { query: filteredQuery, histories: filteredHistories } = cloneChildChatInputs({
    query: selectedQuery,
    histories: selectedHistories
  });
  const filterFiles = <File extends WorkflowFileInput>(inputFiles: File[]) =>
    cloneChildFiles(inputFiles.filter(isSelectedFile));

  let childFileContext = parentFileContext.derive(selectedFiles);
  const childStore: ContextType = {
    ...parentStore,
    fileContext: childFileContext,
    fileRegistrar: undefined
  };

  const resolveInputFile = async (file: ChatFileStoreValue) => {
    const ref = childFileContext.resolveInputFile(file);
    if (ref) return ref.modelUrl;
    if (rejectedFileIdentities.has(getFileIdentity(file) ?? '')) return;
    throw new UserError('Child workflow file is not selected in its file context');
  };

  let registrationQueue = Promise.resolve();
  const childRegistrar: WorkflowFileRegistrar | undefined = parentStore.fileRegistrar
    ? {
        registerInputFile: (params) => {
          const registration = registrationQueue.then(async () => {
            const existingRef = childFileContext.resolveInputFile(params.file);
            if (existingRef) return existingRef;
            if (selectedFiles.length >= maxFileAmount) return;

            const ref = await parentStore.fileRegistrar!.registerInputFile(params);
            if (!ref) return;
            selectedFiles.push(ref.modelUrl);
            const identity = parentFileContext.getIdentity(ref.modelUrl);
            if (identity) acceptedFileIdentities.add(identity);
            const currentParentFileContext = parentStore.fileContext ?? parentFileContext;
            childFileContext = currentParentFileContext.derive(selectedFiles);
            childStore.fileContext = childFileContext;
            return ref;
          });
          registrationQueue = registration.then(
            () => undefined,
            () => undefined
          );
          return registration;
        }
      }
    : undefined;

  childStore.fileRegistrar = childRegistrar;

  return runWithContext(childStore, () =>
    fn({
      resolveInputFile,
      query: filteredQuery,
      histories: filteredHistories,
      filterFiles
    })
  );
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
