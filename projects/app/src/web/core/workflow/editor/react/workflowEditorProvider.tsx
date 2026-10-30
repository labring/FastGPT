import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type {
  WorkflowGraphQueries,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import {
  createWorkflowEditorAdapter,
  type WorkflowActionsHandle,
  type WorkflowEditorAdapter
} from './workflowEditorAdapter';

const WorkflowEditorContext = createContext<WorkflowEditorAdapter | undefined>(undefined);

const emptyGraphQueries: WorkflowGraphQueries = {
  isMountedTool: () => false,
  isHandleConnected: () => false,
  getIncomingEdges: () => [],
  getChildNodeIds: () => [],
  getSourceNodeIds: () => []
};

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
  getWorkflowSnapshot: () => ({ nodes: [], edges: [] }),
  getEdges: () => []
});

type WorkflowEditorProviderProps = {
  /** host 在 hydrate 出 Runtime 之前为 null；此时提供安全的空 adapter。 */
  runtime: WorkflowRuntimePort | null;
  children: ReactNode;
};

/** 为已经 hydrate 成功的 host runtime 提供 scoped Workflow Hooks。 */
export const WorkflowEditorProvider = ({ runtime, children }: WorkflowEditorProviderProps) => {
  const adapter = useMemo(
    () =>
      runtime
        ? createWorkflowEditorAdapter(runtime, false)
        : ({
            connect: () => undefined,
            getWorkflowSnapshot: () => ({ ...emptyActions.getWorkflowSnapshot(), ...emptyActions }),
            subscribeWorkflow: () => () => undefined,
            getNodeSnapshot: () => undefined,
            getNodeActions: () => undefined,
            subscribeNode: () => () => undefined,
            getFieldSnapshot: () => undefined,
            subscribeField: () => () => undefined,
            getReferenceOptions: () => [],
            subscribeReferenceOptions: () => () => undefined,
            getCanvasHandle: () => ({ commitGeometry: emptyActions.commitGeometry }),
            getStructureSnapshot: () => ({ nodes: [], edges: [] }),
            getGraphQueries: () => emptyGraphQueries,
            getWorkflowActions: () => emptyActions,
            getPlacementContext: () => null,
            dispose: () => undefined
          } satisfies WorkflowEditorAdapter),
    [runtime]
  );

  useEffect(() => {
    if (!adapter) return;
    adapter.connect();
    return () => adapter.dispose();
  }, [adapter]);

  return (
    <WorkflowEditorContext.Provider value={adapter}>{children}</WorkflowEditorContext.Provider>
  );
};

export const useWorkflowEditorAdapter = () => {
  const adapter = useContext(WorkflowEditorContext);
  if (!adapter) throw new Error('Workflow hooks must be used inside WorkflowEditorProvider');
  return adapter;
};
