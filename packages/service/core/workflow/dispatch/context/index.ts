import { AsyncLocalStorage } from 'async_hooks';
import type { MCPClient } from '../../../app/mcp';
import { getFileUrlIdentity } from '../../../chat/file/utils';
import type { WorkflowFileContext, WorkflowFileInput } from './file';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatFileStoreValue,
  ChatItemMiniType,
  UserChatItemValueItemType,
  UserChatItemFileItemType
} from '@fastgpt/global/core/chat/type';
import type { WorkflowResourceContext } from '@fastgpt/global/core/workflow/runtime/type';
import type { WorkflowVariableStateLike } from './variables';
import type { WorkflowNodeResponseContext } from './nodeResponse';
import type { WorkflowRuntimeControl } from './runtimeControl';

type WorkflowContextData = {
  /** 本层运行控制；派生 Context 时复制，不能与父层共享可变预算和深度。 */
  runtimeControl: WorkflowRuntimeControl;
  /** 本次运行的停止检查；子工作流继承同一个请求级控制能力。 */
  checkIsStopping: () => boolean;
  mcpClientMemory: Record<string, MCPClient>;
  fileContext: WorkflowFileContext;
  /** 当前流程的变量能力；子 App 独立构建，容器分支克隆后按原有规则回写。 */
  variableContext: WorkflowVariableStateLike;
  /** 本次流程已初始化的响应 Scope；无输出时也必须提供 summary-only Context。 */
  nodeResponseSink: WorkflowNodeResponseContext;
  resourceContext?: WorkflowResourceContext;
};

type WorkflowContextOverrides = Omit<Partial<WorkflowContextData>, 'runtimeControl'> & {
  runtimeControl?: Partial<WorkflowRuntimeControl>;
};

type ContextType = WorkflowContextData & {
  /** 只构建新 Context：控制状态独立复制，其余未覆盖能力共享引用，不激活作用域。 */
  getChildContext: (overrides?: WorkflowContextOverrides) => ContextType;
};

export const WorkflowContext = new AsyncLocalStorage<ContextType>();

/** 构建完整运行 Context，保留入口对象身份；每一级派生均基于方法的实际接收者。 */
const createWorkflowContext = (value: WorkflowContextData): ContextType => {
  if (!value.fileContext) throw new Error('Workflow file context is unavailable');
  if (!value.variableContext) throw new Error('Workflow variable context is unavailable');
  if (typeof value.checkIsStopping !== 'function') {
    throw new Error('Workflow stop checker is unavailable');
  }
  if (
    !value.nodeResponseSink?.workflowRuntimeSummary ||
    typeof value.nodeResponseSink.getChildContext !== 'function'
  ) {
    throw new Error('Workflow node response context is unavailable');
  }
  if (!value.runtimeControl) throw new Error('Workflow runtime control is unavailable');
  return Object.assign(value, {
    getChildContext(this: ContextType, overrides: WorkflowContextOverrides = {}): ContextType {
      if ('runtimeControl' in overrides && !overrides.runtimeControl) {
        throw new Error('Workflow runtime control is unavailable');
      }
      // 控制状态属于本层执行：复制预算、深度和标记；变量等能力仍由调用方决定是否克隆。
      return createWorkflowContext({
        ...this,
        ...overrides,
        runtimeControl: { ...this.runtimeControl, ...overrides.runtimeControl }
      });
    }
  });
};

/** 注入完整运行上下文；无文件也必须传入空文件 Context，禁止带缺失依赖启动节点。 */
export const runWithContext = <T>(value: WorkflowContextData, fn: (ctx: ContextType) => T): T => {
  const context = createWorkflowContext(value);
  return WorkflowContext.run(context, () => fn(context));
};

/** 获取节点运行必需的完整上下文；统一检查作用域及文件限额已初始化，保留合法的零额度。 */
export const getWorkflowContext = (): ContextType => {
  const context = WorkflowContext.getStore();
  if (!context) throw new Error('Workflow context is unavailable');
  if (context.fileContext?.limits.maxFileAmount === undefined) {
    throw new Error('Workflow file context is unavailable');
  }
  if (typeof context.checkIsStopping !== 'function') {
    throw new Error('Workflow stop checker is unavailable');
  }
  if (!context.variableContext) throw new Error('Workflow variable context is unavailable');
  if (
    !context.nodeResponseSink?.workflowRuntimeSummary ||
    typeof context.nodeResponseSink.getChildContext !== 'function'
  ) {
    throw new Error('Workflow node response context is unavailable');
  }
  if (!context.runtimeControl) throw new Error('Workflow runtime control is unavailable');
  return context;
};

export const updateWorkflowContextVal = (val: Partial<WorkflowContextData>) => {
  // 保留初始化阶段尚无运行作用域时不做更新的语义，不调用节点必需的 getter。
  const context = WorkflowContext.getStore();
  if (context) {
    for (const key in val) {
      // @ts-ignore
      context[key] = val[key];
    }
  }
};
// 简化 context 导出
export const getWorkflowFileContext = () => WorkflowContext.getStore()?.fileContext;
export const getWorkflowResourceContext = () => WorkflowContext.getStore()?.resourceContext;

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
 * Child 交互新增文件通过父 Context.register 鉴权，再同步加入当前派生 Context。
 */
export const runWithDerivedWorkflowFileContext = async <T>({
  query = [],
  histories = [],
  files,
  resourceContext,
  fn
}: {
  query?: UserChatItemValueItemType[];
  histories?: ChatItemMiniType[];
  files: WorkflowFileInput[];
  /** 传入时子工作流切换到该资源上下文；省略时继承父级。 */
  resourceContext?: WorkflowResourceContext;
  fn: (scope: {
    resolveInputFile: (file: ChatFileStoreValue) => Promise<string | undefined>;
    query: UserChatItemValueItemType[];
    histories: ChatItemMiniType[];
    filterFiles: <File extends WorkflowFileInput>(files: File[]) => File[];
  }) => Promise<T>;
}): Promise<T> => {
  // Child 必须继承已初始化的父文件 Context，不能在缺失时绕过文件筛选和额度规则。
  const parentStore = getWorkflowContext();
  const { fileContext: parentFileContext } = parentStore;

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
    if (typeof file === 'string') return getFileUrlIdentity(file.trim());
    if ('key' in file && typeof file.key === 'string') return `key:${file.key}`;
    if (typeof file.url === 'string') return getFileUrlIdentity(file.url.trim());
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
  const childFileContext = await parentFileContext.derive(selectedFiles);
  // 直接查询 Child 登记表，后续新增输入也能参与筛选；不维护另一份易失步的可见文件列表。
  const filterFiles = <File extends WorkflowFileInput>(inputFiles: File[]) =>
    cloneChildFiles(
      inputFiles.filter((file) =>
        typeof file === 'string'
          ? Boolean(childFileContext.resolve(file))
          : Boolean(childFileContext.resolveInputFile(file))
      )
    );
  const childStore = parentStore.getChildContext({
    fileContext: childFileContext,
    resourceContext: resourceContext ?? parentStore.resourceContext
  });

  const resolveInputFile = async (file: ChatFileStoreValue) => {
    const ref = childFileContext.resolveInputFile(file);
    if (ref) return ref.modelUrl;
    if (rejectedFileIdentities.has(getFileIdentity(file) ?? '')) return;
    throw new UserError('Child workflow file is not selected in its file context');
  };

  /** 子流程消息同步使用登记后的类型，避免历史消息仍携带兜底 file。 */
  const resolveMessageFile = (file: UserChatItemFileItemType) => {
    const ref = childFileContext.resolveInputFile(file);
    return ref ? { ...file, name: ref.name, type: ref.type, url: ref.modelUrl } : file;
  };
  const preparedQuery = filteredQuery.map((item) =>
    item.file ? { ...item, file: resolveMessageFile(item.file) } : item
  );
  const preparedHistories = filteredHistories.map((message): ChatItemMiniType => {
    if (message.obj !== ChatRoleEnum.Human) return message;
    return {
      ...message,
      value: message.value.map((item) =>
        item.file ? { ...item, file: resolveMessageFile(item.file) } : item
      )
    };
  });

  return runWithContext(childStore, () =>
    fn({
      resolveInputFile,
      query: preparedQuery,
      histories: preparedHistories,
      filterFiles
    })
  );
};
