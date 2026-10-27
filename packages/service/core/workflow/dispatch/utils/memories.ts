import { cloneDeep } from 'lodash-es';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { ChatDispatchProps } from '../../types/runtime';
import { getWorkflowSourceNodeKey } from './source';

type RunningAppInfo = Pick<ChatDispatchProps['runningAppInfo'], 'sourceType' | 'sourceId'>;

export type ForkWorkflowMemoryOptions = {
  history?: ChatItemMiniType[] | number;
  histories?: ChatItemMiniType[];
  hasInteractiveResume?: boolean;
};

const LEGACY_AGENT_MEMORY_PREFIX = 'agentLoopMemory-';

/**
 * 从历史消息末尾提取上一轮 AI 持久化的 memories。
 * 仅读取末尾为 AI 的消息记录，避免末尾是 Human 时误读更早轮次的过期状态。
 */
const extractLastAiHistoryMemories = (histories?: ChatItemMiniType[]): Record<string, any> => {
  const lastHistory = histories?.[histories.length - 1];
  if (!lastHistory || lastHistory.obj !== ChatRoleEnum.AI || !lastHistory.memories) {
    return {};
  }
  if (typeof lastHistory.memories !== 'object' || Array.isArray(lastHistory.memories)) {
    return {};
  }
  return cloneDeep(lastHistory.memories);
};

/**
 * 兼容读取旧版格式的节点记忆（仅用于读取历史基线 baseline）：
 * 1. 旧版子工作流未携带调用路径前缀，直接存储为 `${sourceType}:${sourceId}:${nodeId}`。
 *    仅在 baseline 中尚不存在任何带作用域前缀的同名节点键时回退，防止多实例串读。
 * 2. 旧版 piAgent 节点使用 `agentLoopMemory-${nodeId}`。
 */
const readLegacyBaselineMemory = ({
  baseline,
  baseKey,
  canonicalKey,
  nodeId
}: {
  baseline: Record<string, any>;
  baseKey: string;
  canonicalKey: string;
  nodeId: string;
}): any => {
  if (canonicalKey !== baseKey && Object.hasOwn(baseline, baseKey)) {
    const scopedSuffix = `/${baseKey}`;
    const hasAnyScopedKey = Object.keys(baseline).some((key) => key.endsWith(scopedSuffix));
    if (!hasAnyScopedKey) {
      return cloneDeep(baseline[baseKey]);
    }
  }

  const legacyAgentKey = `${LEGACY_AGENT_MEMORY_PREFIX}${nodeId}`;
  if (Object.hasOwn(baseline, legacyAgentKey)) {
    return cloneDeep(baseline[legacyAgentKey]);
  }

  return undefined;
};

/**
 * 当节点已按新统一格式写入 delta 时，清理基线中对应的旧版 legacy key，
 * 避免旧 key（如暂停态的 `agentLoopMemory-${nodeId}`）残留在落库字典中导致后续轮次误读。
 */
const cleanupSupersededLegacyKeys = ({
  record,
  delta
}: {
  record: Record<string, any>;
  delta: Record<string, any>;
}) => {
  for (const canonicalKey of Object.keys(delta)) {
    const slashIndex = canonicalKey.lastIndexOf('/');
    const baseKey = slashIndex >= 0 ? canonicalKey.slice(slashIndex + 1) : canonicalKey;

    if (canonicalKey !== baseKey && !Object.hasOwn(delta, baseKey)) {
      delete record[baseKey];
    }

    const firstColon = baseKey.indexOf(':');
    const secondColon = firstColon >= 0 ? baseKey.indexOf(':', firstColon + 1) : -1;
    if (secondColon >= 0) {
      const nodeId = baseKey.slice(secondColon + 1);
      const legacyAgentKey = `${LEGACY_AGENT_MEMORY_PREFIX}${nodeId}`;
      if (!Object.hasOwn(delta, legacyAgentKey)) {
        delete record[legacyAgentKey];
      }
    }
  }
};

/**
 * 工作流节点记忆运行态容器。
 *
 * 采用“只读快照基线（baseline）+ 局部增量写集（delta）+ 调用路径作用域（scopePath）”模型：
 * 1. 根工作流从上一轮 AI 历史消息初始化 baseline；
 * 2. 子工作流、工具调用、循环体和并行任务通过 `fork()` 派生独立子状态；
 * 3. 子流程执行完仅向上返回自身的 `getDelta()`，杜绝并行子节点回写时用旧 baseline 覆盖兄弟节点的最新写入；
 * 4. 根工作流结束时通过 `toRecord()` 合并 baseline 与 delta，保留本轮未触发分支的历史记忆。
 */
export class WorkflowMemoryState {
  private readonly baseline: Record<string, any>;
  private readonly delta: Record<string, any>;
  private readonly scopePath: readonly string[];
  readonly isForked: boolean;

  private constructor({
    baseline = {},
    delta = {},
    scopePath = [],
    isForked = false
  }: {
    baseline?: Record<string, any>;
    delta?: Record<string, any>;
    scopePath?: readonly string[];
    isForked?: boolean;
  }) {
    this.baseline = cloneDeep(baseline);
    this.delta = cloneDeep(delta);
    this.scopePath = [...scopePath];
    this.isForked = isForked;
  }

  /**
   * 从已有的记忆字典直接构造根工作流记忆状态。
   */
  static fromRecord(
    baseline?: Record<string, any>,
    scopePath: readonly string[] = []
  ): WorkflowMemoryState {
    return new WorkflowMemoryState({
      baseline,
      scopePath,
      isForked: false
    });
  }

  /**
   * 从聊天历史构造根工作流记忆状态；传入 parentMemoryState 时继承其作用域路径。
   */
  static fromHistories(
    histories?: ChatItemMiniType[],
    parentMemoryState?: WorkflowMemoryState
  ): WorkflowMemoryState {
    return new WorkflowMemoryState({
      baseline: extractLastAiHistoryMemories(histories),
      scopePath: parentMemoryState ? parentMemoryState.scopePath : [],
      isForked: false
    });
  }

  /**
   * 派生子流程或并发任务专用的隔离记忆状态。
   * 子状态默认捕获当前时刻的完整可读快照作为 baseline，但自身 delta 重置为空；
   * 若传入 options，则按节点的 history 配置（禁用历史 / 自定义历史数组 / 交互恢复）隔离 baseline。
   */
  fork(scopeSegment?: string, options?: ForkWorkflowMemoryOptions): WorkflowMemoryState {
    const normalizedSegment = scopeSegment?.trim();
    const nextScopePath =
      normalizedSegment !== undefined && normalizedSegment !== ''
        ? [...this.scopePath, normalizedSegment]
        : this.scopePath;
    const nextBaseline = (() => {
      if (!options || options.hasInteractiveResume) {
        return this.toRecord();
      }
      if (options.history === 0) {
        return {};
      }
      if (Array.isArray(options.history)) {
        return extractLastAiHistoryMemories(options.histories ?? options.history);
      }
      return this.toRecord();
    })();

    return new WorkflowMemoryState({
      baseline: nextBaseline,
      delta: {},
      scopePath: nextScopePath,
      isForked: true
    });
  }

  /**
   * 生成统一格式的节点记忆键：
   * - 根作用域：`${sourceType}:${sourceId}:${nodeId}`
   * - 子作用域：`node:${parentNodeId}/.../${sourceType}:${sourceId}:${nodeId}`
   * - 未提供 runningAppInfo 时回退为 `agentLoopMemory-${nodeId}`
   */
  getNodeMemoryKey({
    runningAppInfo,
    nodeId
  }: {
    runningAppInfo?: RunningAppInfo;
    nodeId: string;
  }): string {
    const baseKey = runningAppInfo
      ? getWorkflowSourceNodeKey({ runningAppInfo, nodeId })
      : `${LEGACY_AGENT_MEMORY_PREFIX}${nodeId}`;
    return this.scopePath.length > 0 ? `${this.scopePath.join('/')}/${baseKey}` : baseKey;
  }

  /**
   * 读取当前节点的记忆值：优先读取本轮增量 delta，其次读取基线 baseline，最后兼容旧版 legacy key。
   */
  readNodeMemory({
    runningAppInfo,
    nodeId
  }: {
    runningAppInfo?: RunningAppInfo;
    nodeId: string;
  }): any {
    if (!runningAppInfo) {
      const legacyAgentKey = `${LEGACY_AGENT_MEMORY_PREFIX}${nodeId}`;
      const scopedLegacyKey =
        this.scopePath.length > 0
          ? `${this.scopePath.join('/')}/${legacyAgentKey}`
          : legacyAgentKey;
      if (Object.hasOwn(this.delta, scopedLegacyKey)) {
        return cloneDeep(this.delta[scopedLegacyKey]);
      }
      if (Object.hasOwn(this.baseline, scopedLegacyKey)) {
        return cloneDeep(this.baseline[scopedLegacyKey]);
      }
      if (scopedLegacyKey !== legacyAgentKey && Object.hasOwn(this.baseline, legacyAgentKey)) {
        return cloneDeep(this.baseline[legacyAgentKey]);
      }
      return undefined;
    }

    const baseKey = getWorkflowSourceNodeKey({ runningAppInfo, nodeId });
    const canonicalKey =
      this.scopePath.length > 0 ? `${this.scopePath.join('/')}/${baseKey}` : baseKey;

    if (Object.hasOwn(this.delta, canonicalKey)) {
      return cloneDeep(this.delta[canonicalKey]);
    }
    if (Object.hasOwn(this.baseline, canonicalKey)) {
      return cloneDeep(this.baseline[canonicalKey]);
    }

    return readLegacyBaselineMemory({
      baseline: this.baseline,
      baseKey,
      canonicalKey,
      nodeId
    });
  }

  /**
   * 将节点或子流程产出的记忆增量合并到当前作用域的 delta 中。
   */
  merge(entries?: Record<string, any>): void {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;
    for (const [key, value] of Object.entries(entries)) {
      this.delta[key] = cloneDeep(value);
    }
  }

  /**
   * 获取当前作用域内实际新增或更新过的记忆增量。
   */
  getDelta(): Record<string, any> {
    return cloneDeep(this.delta);
  }

  /**
   * 获取合并基线与本轮增量后的完整记忆字典。
   */
  toRecord(): Record<string, any> {
    const record = {
      ...cloneDeep(this.baseline),
      ...cloneDeep(this.delta)
    };
    cleanupSupersededLegacyKeys({
      record,
      delta: this.delta
    });
    return record;
  }
}

/**
 * 获取当前节点的标准记忆键；未提供 runningAppInfo 时回退为 `agentLoopMemory-${nodeId}`。
 */
export const getWorkflowNodeMemoryKey = ({
  memoryState,
  runningAppInfo,
  nodeId
}: {
  memoryState?: WorkflowMemoryState;
  runningAppInfo?: RunningAppInfo;
  nodeId: string;
}): string => {
  if (memoryState) {
    return memoryState.getNodeMemoryKey({ runningAppInfo, nodeId });
  }
  if (!runningAppInfo) {
    return `${LEGACY_AGENT_MEMORY_PREFIX}${nodeId}`;
  }
  return getWorkflowSourceNodeKey({ runningAppInfo, nodeId });
};

/**
 * 合并持久化到 ChatItem.memories 的字典，并自动清理已被新统一键替代的旧版 legacy key。
 */
export const mergePersistedWorkflowMemories = (
  existingMemories?: Record<string, any>,
  incomingMemories?: Record<string, any>
): Record<string, any> => {
  const state = WorkflowMemoryState.fromRecord(existingMemories);
  state.merge(incomingMemories);
  return state.toRecord();
};

/**
 * 按节点的 history 配置读取节点记忆：
 * 1. `history === 0`：显式禁用历史与记忆，返回 undefined；
 * 2. `Array.isArray(history)`：从上游传入的自定义历史记录末尾读取；
 * 3. 数值窗口或默认未传：从当前工作流 memoryState（或 histories 兜底）读取。
 */
export const readWorkflowNodeMemory = <T = any>({
  memoryState,
  runningAppInfo,
  nodeId,
  history = 6,
  histories
}: {
  memoryState?: WorkflowMemoryState;
  runningAppInfo?: RunningAppInfo;
  nodeId: string;
  history?: ChatItemMiniType[] | number;
  histories?: ChatItemMiniType[];
}): T | undefined => {
  if (history === 0) {
    return undefined;
  }

  if (Array.isArray(history)) {
    return WorkflowMemoryState.fromHistories(history, memoryState).readNodeMemory({
      runningAppInfo,
      nodeId
    }) as T | undefined;
  }

  const state = memoryState ?? WorkflowMemoryState.fromHistories(histories);
  return state.readNodeMemory({
    runningAppInfo,
    nodeId
  }) as T | undefined;
};
