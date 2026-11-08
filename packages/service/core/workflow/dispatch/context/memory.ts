import { cloneDeep } from 'lodash-es';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  getHistoryWorkflowMemories,
  getWorkflowMemoryKey,
  mergeWorkflowMemories,
  readLegacyWorkflowMemory,
  type WorkflowMemorySource
} from '../../memory/utils';

type ForkWorkflowMemoryOptions = {
  history?: ChatItemMiniType[] | number;
  histories?: ChatItemMiniType[];
  hasInteractiveResume?: boolean;
};

/**
 * 本层工作流的记忆 Context，保存只读基线、当前增量和调用路径，不依赖 ALS。
 * 子运行 fork 后独立写入，仅向父级提交 delta；
 * 根运行输出完整快照，保留未触发分支的记忆。读写边界深拷贝，防止并行分支共享可变引用。
 */
export class WorkflowMemoryContext {
  private readonly delta: Record<string, any> = {};
  private readonly baseline: Record<string, any>;
  private readonly scopePath: readonly string[];
  private readonly rootSource?: WorkflowMemorySource;
  readonly isForked: boolean;

  /** baseline 由工厂或 fork 创建，已是当前状态独占的快照，不在构造时重复拷贝。 */
  private constructor({
    baseline = {},
    scopePath = [],
    rootSource,
    isForked = false
  }: {
    baseline?: Record<string, any>;
    scopePath?: readonly string[];
    rootSource?: WorkflowMemorySource;
    isForked?: boolean;
  }) {
    this.baseline = baseline;
    this.scopePath = scopePath;
    this.rootSource = rootSource
      ? { sourceType: rootSource.sourceType, sourceId: rootSource.sourceId }
      : undefined;
    this.isForked = isForked;
  }

  /** 从已有字典创建独立状态，根来源用于保护合法根键及识别旧子流程键。 */
  static fromRecord(
    baseline?: Record<string, any>,
    context: { rootSource?: WorkflowMemorySource } = {}
  ): WorkflowMemoryContext {
    return new WorkflowMemoryContext({ baseline: cloneDeep(baseline), ...context });
  }

  /** 自定义历史替换基线，同时继承父状态的调用路径和根来源。 */
  static fromHistories(
    histories?: ChatItemMiniType[],
    context: { parentMemoryContext?: WorkflowMemoryContext; rootSource?: WorkflowMemorySource } = {}
  ): WorkflowMemoryContext {
    const { parentMemoryContext, rootSource } = context;
    return new WorkflowMemoryContext({
      baseline: getHistoryWorkflowMemories(histories),
      scopePath: parentMemoryContext?.scopePath,
      rootSource: parentMemoryContext?.rootSource ?? rootSource
    });
  }

  /** 显式参数适配器：复用传入 Context 或从历史构建，供独立 runner 和测试使用，不读取 ALS。 */
  static fromWorkflow({
    memoryContext,
    histories,
    runningAppInfo
  }: {
    memoryContext?: WorkflowMemoryContext;
    histories?: ChatItemMiniType[];
    runningAppInfo?: WorkflowMemorySource;
  }): WorkflowMemoryContext {
    return (
      memoryContext ??
      WorkflowMemoryContext.fromHistories(histories, { rootSource: runningAppInfo })
    );
  }

  /** 派生独立写集；交互恢复保留 checkpoint，普通调用遵守禁用历史和自定义历史配置。 */
  fork(scopeSegment?: string, options?: ForkWorkflowMemoryOptions): WorkflowMemoryContext {
    const baseline = (() => {
      if (options?.hasInteractiveResume) return this.toRecord();
      if (options?.history === 0) return {};
      if (Array.isArray(options?.history)) {
        return getHistoryWorkflowMemories(options.histories ?? options.history);
      }
      return this.toRecord();
    })();

    return new WorkflowMemoryContext({
      baseline,
      scopePath: scopeSegment ? [...this.scopePath, scopeSegment] : this.scopePath,
      rootSource: this.rootSource,
      isForked: true
    });
  }

  /** 生成当前调用路径下的节点键，键格式与旧键兼容规则由纯工具模块统一管理。 */
  getNodeMemoryKey(params: { runningAppInfo?: WorkflowMemorySource; nodeId: string }): string {
    return getWorkflowMemoryKey({ ...params, scopePath: this.scopePath });
  }

  /** 按当前增量、历史基线、旧格式键依次读取，显式 undefined 会阻止回退到旧暂停态。 */
  readNodeMemory<T = any>({
    runningAppInfo,
    nodeId
  }: {
    runningAppInfo?: WorkflowMemorySource;
    nodeId: string;
  }): T | undefined {
    const memoryKey = this.getNodeMemoryKey({ runningAppInfo, nodeId });
    if (Object.hasOwn(this.delta, memoryKey)) return cloneDeep(this.delta[memoryKey]);
    if (Object.hasOwn(this.baseline, memoryKey)) return cloneDeep(this.baseline[memoryKey]);
    return cloneDeep(
      readLegacyWorkflowMemory({
        baseline: this.baseline,
        runningAppInfo,
        nodeId,
        memoryKey,
        rootSource: this.rootSource
      })
    );
  }

  /** 合并内部节点/子流程的写集，保留 undefined 删除标记，并隔离调用方后续的对象修改。 */
  merge(entries?: Record<string, any>): void {
    if (!entries) return;
    for (const [key, value] of Object.entries(entries)) this.delta[key] = cloneDeep(value);
  }

  /** 子流程仅返回自身写集，避免旧基线覆盖并发兄弟节点的新写入。 */
  getDelta(): Record<string, any> {
    return cloneDeep(this.delta);
  }

  /** 返回完整快照，并执行与持久化层一致的旧键清理。 */
  toRecord(): Record<string, any> {
    return mergeWorkflowMemories({
      baseline: this.baseline,
      entries: this.delta,
      rootSource: this.rootSource
    });
  }
}

/** 节点和独立 Agent runner 共用的键入口，兼容没有运行状态的调用。 */
export const getWorkflowNodeMemoryKey = ({
  memoryContext,
  ...params
}: {
  memoryContext?: WorkflowMemoryContext;
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
}): string =>
  memoryContext ? memoryContext.getNodeMemoryKey(params) : getWorkflowMemoryKey(params);

/** 统一读取策略：普通调用按 history=0、自定义历史和当前状态依次处理。 */
export const readWorkflowNodeMemory = <T = any>({
  memoryContext,
  runningAppInfo,
  nodeId,
  history = 6,
  histories
}: {
  memoryContext?: WorkflowMemoryContext;
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
  history?: ChatItemMiniType[] | number;
  histories?: ChatItemMiniType[];
}): T | undefined => {
  if (history === 0) return undefined;
  const state = Array.isArray(history)
    ? WorkflowMemoryContext.fromHistories(history, {
        parentMemoryContext: memoryContext,
        rootSource: runningAppInfo
      })
    : WorkflowMemoryContext.fromWorkflow({ memoryContext, histories, runningAppInfo });
  return state.readNodeMemory<T>({ runningAppInfo, nodeId });
};
