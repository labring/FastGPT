import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { createWorkflowEditorAdapter, type WorkflowEditorAdapter } from './workflowEditorAdapter';

const WorkflowEditorContext = createContext<WorkflowEditorAdapter | undefined>(undefined);

type WorkflowEditorProviderProps = {
  /** host 在 hydrate 出 Runtime 之前为 null；此时不挂 adapter，hooks 与未挂载时一样抛错。 */
  runtime: WorkflowRuntimePort | null;
  children: ReactNode;
};

/** 为已经 hydrate 成功的 host runtime 提供 scoped Workflow Hooks。 */
export const WorkflowEditorProvider = ({ runtime, children }: WorkflowEditorProviderProps) => {
  const adapter = useMemo(
    () => (runtime ? createWorkflowEditorAdapter(runtime, false) : undefined),
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
