import { WorkflowReferenceScope } from '@fastgpt/web/components/common/Textarea/PromptEditor/context';
import type { WorkflowFieldQuery } from '@fastgpt/global/core/workflow/editor/types';
import type { ReactNode } from 'react';
import { useField } from './react/useField';

export const WorkflowFieldScope = ({
  nodeId,
  fieldKey,
  kind = 'input',
  children
}: WorkflowFieldQuery & { children: ReactNode }) => {
  const references = useField({ nodeId, fieldKey, kind }, (field) => field?.reference);

  return <WorkflowReferenceScope references={references}>{children}</WorkflowReferenceScope>;
};
