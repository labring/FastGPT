import { AsyncLocalStorage } from 'async_hooks';
import type { MCPClient } from '../../../app/mcp';
import type { WorkflowFileContext, WorkflowFileInput } from './file';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { WorkflowResourceContext } from '@fastgpt/global/core/workflow/runtime/type';
import type { WorkflowVariableStateLike } from './variables';
import type { WorkflowNodeResponseContext } from './nodeResponse';
import type { WorkflowMemoryContext } from './memory';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import { prepareDerivedWorkflowFileContext } from './file';

/**
 * 当前 workflow 层的运行控制状态，不属于节点业务入参。
 * 队列统一扣减本层预算；节点执行时捕获快照，子流程从该快照派生，避免并发串状态。
 */
export type WorkflowRuntimeControl = {
  mode: 'test' | 'chat' | 'debug';
  maxRunTimes: number;
  /** runWorkflow 进入时递增，完成、失败或深度拒绝后恢复。 */
  workflowDispatchDeep: number;
  isToolCall: boolean;
};

/** 根入口确定的沙盒归属；子流程继承该身份，资源鉴权仍使用自身 runningAppInfo。 */
export type WorkflowSandboxContext = Readonly<{
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  teamId: string;
  userId: string;
  chatId: string;
}>;

type WorkflowContextData = {
  /** 本层运行控制；派生 Context 时复制，不能与父层共享可变预算和深度。 */
  runtimeControl: WorkflowRuntimeControl;
  /** 本次运行的停止检查；子工作流继承同一个请求级控制能力。 */
  checkIsStopping: () => boolean;
  mcpClientMemory: Record<string, MCPClient>;
  /** 当前运行的事件输出；子流程可继承、过滤或显式禁用，不能回退到根 writer。 */
  workflowStreamResponse?: WorkflowResponseType;
  fileContext: WorkflowFileContext;
  /** 当前流程的变量能力；子 App 独立构建，容器分支克隆后按原有规则回写。 */
  variableContext: WorkflowVariableStateLike;
  /** 本层记忆；普通节点共享，子运行显式 fork 后注入，按原有规则归集增量。 */
  memoryContext: WorkflowMemoryContext;
  /** 本次流程已初始化的响应 Scope；无输出时也必须提供 summary-only Context。 */
  nodeResponseSink: WorkflowNodeResponseContext;
  resourceContext?: WorkflowResourceContext;
  sandboxContext?: WorkflowSandboxContext;
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
  if (!value.memoryContext) throw new Error('Workflow memory context is unavailable');
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
  if (!context.memoryContext) throw new Error('Workflow memory context is unavailable');
  if (
    !context.nodeResponseSink?.workflowRuntimeSummary ||
    typeof context.nodeResponseSink.getChildContext !== 'function'
  ) {
    throw new Error('Workflow node response context is unavailable');
  }
  if (!context.runtimeControl) throw new Error('Workflow runtime control is unavailable');
  return context;
};

// 简化 context 导出
export const getWorkflowFileContext = () => WorkflowContext.getStore()?.fileContext;
export const getWorkflowResourceContext = () => WorkflowContext.getStore()?.resourceContext;

/** 读取根沙盒身份；独立运行节点时才使用当前应用身份兜底，不依赖工作流记忆。 */
export const getWorkflowSandboxContext = (
  fallback: WorkflowSandboxContext
): WorkflowSandboxContext => WorkflowContext.getStore()?.sandboxContext ?? fallback;

/** 准备 Child 文件输入后仅编排引用覆盖与作用域激活；文件准入策略集中在 file.ts。 */
export const runWithDerivedWorkflowFileContext = async <T>({
  query,
  histories,
  files,
  resourceContext,
  fn
}: {
  query?: UserChatItemValueItemType[];
  histories?: ChatItemMiniType[];
  files: WorkflowFileInput[];
  resourceContext?: WorkflowResourceContext;
  fn: (
    scope: Omit<Awaited<ReturnType<typeof prepareDerivedWorkflowFileContext>>, 'fileContext'>
  ) => Promise<T>;
}): Promise<T> => {
  const parent = getWorkflowContext();
  const { fileContext, ...inputs } = await prepareDerivedWorkflowFileContext({
    parent: parent.fileContext,
    query,
    histories,
    files
  });
  const child = parent.getChildContext({
    fileContext,
    resourceContext: resourceContext ?? parent.resourceContext
  });
  return runWithContext(child, () => fn(inputs));
};
