import { useMemo, useSyncExternalStore } from 'react';
import type { WorkflowFieldQuery } from '@fastgpt/global/core/workflow/editor/types';
import type { WorkflowFieldHandle } from './workflowEditorAdapter';
import { useWorkflowEditorAdapter } from './workflowEditorProvider';

type Listener = () => void;
type FieldSelector<T> = (field: WorkflowFieldHandle | undefined) => T;
type RawMode = { raw: true };
type FieldReadMode<T> = FieldSelector<T> | RawMode;

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

/** 订阅单字段并返回所选值；完整句柄仅用于确需同时访问字段数据、引用和写 action 的场景。 */
export function useField<T>(query: WorkflowFieldQuery, selector: FieldSelector<T>): T;
export function useField(
  query: WorkflowFieldQuery,
  options: RawMode
): WorkflowFieldHandle | undefined;
export function useField(
  nodeId: string,
  fieldKey: string,
  kind: WorkflowFieldQuery['kind'],
  options: RawMode
): WorkflowFieldHandle | undefined;
export function useField<T>(
  nodeId: string,
  fieldKey: string,
  kind: WorkflowFieldQuery['kind'],
  selector: FieldSelector<T>
): T;
export function useField<T>(
  queryOrNodeId: WorkflowFieldQuery | string,
  fieldKeyOrMode: string | FieldReadMode<T>,
  kind?: WorkflowFieldQuery['kind'],
  positionalMode?: FieldReadMode<T>
): T | WorkflowFieldHandle | undefined {
  const adapter = useWorkflowEditorAdapter();
  const queryNodeId = typeof queryOrNodeId === 'string' ? queryOrNodeId : queryOrNodeId.nodeId;
  const queryFieldKey = typeof queryOrNodeId === 'string' ? fieldKeyOrMode : queryOrNodeId.fieldKey;
  const queryKind = typeof queryOrNodeId === 'string' ? kind : queryOrNodeId.kind;
  const mode = typeof queryOrNodeId === 'string' ? positionalMode : fieldKeyOrMode;
  if (!mode || typeof queryFieldKey !== 'string') {
    throw new Error('useField requires a field selector or { raw: true } mode');
  }
  const query = useStableFieldQuery({
    nodeId: queryNodeId,
    fieldKey: queryFieldKey,
    kind: queryKind
  });
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeField(query, listener),
    [adapter, query]
  );
  const getSnapshot = () => {
    const field = adapter.getFieldSnapshot(query);
    return typeof mode === 'function' ? mode(field) : field;
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * 返回稳定的字段写能力，不订阅字段变化；`setValue` 在调用时读取最新字段句柄。
 */
export const useFieldActions = (query: WorkflowFieldQuery) => {
  const adapter = useWorkflowEditorAdapter();
  const stableQuery = useStableFieldQuery(query);

  return useMemo(
    () => ({
      setValue: (value: unknown) => adapter.getFieldSnapshot(stableQuery)?.setValue(value)
    }),
    [adapter, stableQuery]
  );
};
