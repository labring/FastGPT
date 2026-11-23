import type { WorkflowFieldSnapshot } from '@fastgpt/global/core/workflow/editor/types';
import { createContext, useContext, type ReactNode } from 'react';
import type { EditorVariableLabelPickerType } from './type';

type WorkflowReferenceScopeValue = WorkflowFieldSnapshot['references'] | undefined;

const WorkflowReferenceContext = createContext<WorkflowReferenceScopeValue>(undefined);
export const VariableLabelContext = createContext<
  readonly EditorVariableLabelPickerType[] | undefined
>(undefined);

export const WorkflowReferenceScope = ({
  references,
  children
}: {
  references?: WorkflowFieldSnapshot['references'];
  children: ReactNode;
}) => {
  return (
    <WorkflowReferenceContext.Provider value={references}>
      {children}
    </WorkflowReferenceContext.Provider>
  );
};

export const useWorkflowReferenceScope = () => useContext(WorkflowReferenceContext);
