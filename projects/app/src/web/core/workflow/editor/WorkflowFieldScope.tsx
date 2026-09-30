import { WorkflowReferenceScope } from '@fastgpt/web/components/common/Textarea/PromptEditor/context';
import type { WorkflowFieldQuery } from '@fastgpt/global/core/workflow/editor/types';
import type { ReactNode } from 'react';
import { useField } from './react';

export const WorkflowFieldScope = ({
  nodeId,
  fieldKey,
  kind = 'input',
  children
}: WorkflowFieldQuery & { children: ReactNode }) => {
  const field = useField({ nodeId, fieldKey, kind });

  return <WorkflowReferenceScope references={field?.reference}>{children}</WorkflowReferenceScope>;
};
