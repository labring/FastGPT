import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import type {
  WorkflowActionsHandle,
  WorkflowGraphQueries,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import { createWorkflowEditorAdapter, type WorkflowEditorAdapter } from './workflowEditorAdapter';

const WorkflowEditorContext = createContext<WorkflowEditorAdapter | undefined>(undefined);

const emptyGraphQueries: WorkflowGraphQueries = {
  isMountedTool: () => false,
  isHandleConnected: () => false,
  getIncomingEdges: () => [],
  getChildNodeIds: () => [],
  getSourceNodeIds: () => emptyNodeIds
};

const emptyNodeIds = Object.freeze([]) as readonly never[];
const emptyStructureSnapshot = Object.freeze({
  nodes: emptyNodeIds,
  edges: emptyNodeIds
});

const notReady = () => ({
  ok: false,
  error: { code: 'disposed' as const, message: 'Workflow is not ready' }
});

const emptyActions: WorkflowActionsHandle = Object.freeze({
  addNode: notReady,
  addNodes: notReady,
  connectEdge: notReady,
  disconnectEdge: notReady,
  disconnectEdges: notReady,
  removeNodes: notReady,
  attachToContainer: notReady,
  commitGeometry: notReady,
  getWorkflowSnapshot: () => emptyStructureSnapshot,
  getEdges: () => emptyNodeIds
});

const emptyWorkflowSnapshot = Object.freeze({ ...emptyStructureSnapshot, ...emptyActions });
const emptyCanvasHandle = Object.freeze({ commitGeometry: emptyActions.commitGeometry });
const emptyReferenceOptions = emptyNodeIds;
const emptySubscribe = () => () => undefined;
const emptyAdapter: WorkflowEditorAdapter = Object.freeze({
  getWorkflowSnapshot: () => emptyWorkflowSnapshot,
  subscribeWorkflow: emptySubscribe,
  getNodeSnapshot: () => undefined,
  getNodeActions: () => undefined,
  subscribeNode: emptySubscribe,
  getFieldSnapshot: () => undefined,
  subscribeField: emptySubscribe,
  getReferenceOptions: () => emptyReferenceOptions,
  subscribeReferenceOptions: emptySubscribe,
  getCanvasHandle: () => emptyCanvasHandle,
  getStructureSnapshot: () => emptyStructureSnapshot,
  getGraphQueries: () => emptyGraphQueries,
  getWorkflowActions: () => emptyActions,
  getPlacementContext: () => null
});

type WorkflowEditorProviderProps = {
  /** host 在 hydrate 出 Runtime 之前为 null；此时提供安全的空 adapter。 */
  runtime: WorkflowRuntimePort | null;
  children: ReactNode;
};

/** 为已经 hydrate 成功的 host runtime 提供 scoped Workflow Hooks。 */
export const WorkflowEditorProvider = ({ runtime, children }: WorkflowEditorProviderProps) => {
  const adapter = useMemo(
    () => (runtime ? createWorkflowEditorAdapter(runtime) : emptyAdapter),
    [runtime]
  );

  return (
    <WorkflowEditorContext.Provider value={adapter}>{children}</WorkflowEditorContext.Provider>
  );
};

export const useWorkflowEditorAdapter = () => {
  const adapter = useContext(WorkflowEditorContext);
  if (!adapter) throw new Error('Workflow hooks must be used inside WorkflowEditorProvider');
  return adapter;
};
