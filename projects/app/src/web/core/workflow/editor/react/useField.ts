import { useMemo, useSyncExternalStore } from 'react';
import type {
  WorkflowFieldQuery,
  WorkflowReferenceOptionsQuery,
  WorkflowReferenceOption
} from '@fastgpt/global/core/workflow/editor/types';
import type { WorkflowFieldHandle } from './workflowEditorAdapter';
import { useWorkflowEditorAdapter } from './workflowEditorProvider';

type Listener = () => void;

/**
 * 把字段查询压成稳定对象：`subscribe` / `getSnapshot` 的 memo key 依赖它的身份，
 * 调用方每次渲染传字面量对象也不会重复订阅。`kind` 缺省时不写进对象，
 * 让「不指定 kind」与「kind: undefined」共用同一个 registry key。
 */
const useStableFieldQuery = ({ nodeId, fieldKey, kind }: WorkflowFieldQuery): WorkflowFieldQuery =>
  useMemo(
    () => ({ nodeId, fieldKey, ...(kind !== undefined ? { kind } : {}) }),
    [nodeId, fieldKey, kind]
  );

/** 读取单字段的 committed snapshot、引用状态，并提供稳定的字段提交 action。 */
export function useField(query: WorkflowFieldQuery): WorkflowFieldHandle | undefined;
export function useField(
  nodeId: string,
  fieldKey: string,
  kind?: WorkflowFieldQuery['kind']
): WorkflowFieldHandle | undefined;
export function useField(
  queryOrNodeId: WorkflowFieldQuery | string,
  fieldKey?: string,
  kind?: WorkflowFieldQuery['kind']
): WorkflowFieldHandle | undefined {
  const adapter = useWorkflowEditorAdapter();
  const queryNodeId = typeof queryOrNodeId === 'string' ? queryOrNodeId : queryOrNodeId.nodeId;
  const queryFieldKey = typeof queryOrNodeId === 'string' ? fieldKey : queryOrNodeId.fieldKey;
  const queryKind = typeof queryOrNodeId === 'string' ? kind : queryOrNodeId.kind;
  const query = useStableFieldQuery({
    nodeId: queryNodeId,
    fieldKey: queryFieldKey!,
    kind: queryKind
  });
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeField(query, listener),
    [adapter, query]
  );
  const getSnapshot = useMemo(() => () => adapter.getFieldSnapshot(query), [adapter, query]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 订阅 Runtime 的引用候选项；嵌套结构化值与普通 input 共用 Reference module。 */
export const useReferenceOptions = (
  query: WorkflowReferenceOptionsQuery
): readonly WorkflowReferenceOption[] => {
  const adapter = useWorkflowEditorAdapter();
  const stableQuery = useMemo(
    () => ({
      nodeId: query.nodeId,
      ...(query.valueType !== undefined ? { valueType: query.valueType } : {}),
      ...(query.includeChildren ? { includeChildren: true } : {})
    }),
    [query.includeChildren, query.nodeId, query.valueType]
  );
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeReferenceOptions(listener),
    [adapter]
  );
  const getSnapshot = useMemo(
    () => () => adapter.getReferenceOptions(stableQuery),
    [adapter, stableQuery]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * 从单字段的 scoped 快照派生一个值，只在该字段变化且派生结果变化时重渲染。
 *
 * 订阅什么：`query` 命中的字段（不传 `kind` 时同名 input/output 都算）。
 * 什么时候重渲染：该字段被通知后，selector 返回值与上一次不满足 `Object.is` 时。
 * 同一节点其它字段的写入、结构变更与几何提交都不通知。
 *
 * selector 入参是 `WorkflowFieldHandle | undefined`：字段或所属节点被删除时为 `undefined`，
 * selector 必须容忍。返回值约束与 `useWorkflowValue` 相同：原始值或稳定引用，不能新建对象。
 * `query` 可以每次渲染传新对象，hook 内部按 nodeId/fieldKey/kind 归一成稳定引用，不会重复订阅。
 *
 * 与 `useField` 的分工：需要 `setValue` 提交，或需要把整份 `data` / `reference` 传给下游时用
 * `useField`；只要一个派生的原始值（例如「当前是否有值」）时用本 hook。
 */
export const useFieldValue = <T>(
  query: WorkflowFieldQuery,
  selector: (field: WorkflowFieldHandle | undefined) => T
): T => {
  const adapter = useWorkflowEditorAdapter();
  const stableQuery = useStableFieldQuery(query);
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeField(stableQuery, listener),
    [adapter, stableQuery]
  );
  const getSnapshot = () => selector(adapter.getFieldSnapshot(stableQuery));
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
