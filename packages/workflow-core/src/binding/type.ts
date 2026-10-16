import type {
  WorkflowInputDefaultPolicy,
  WorkflowResourceKind
} from '@fastgpt/global/core/workflow/template/type';

export type WorkflowBindingStatus = 'missing' | 'unverified';

export type WorkflowBindingRequirement = {
  nodeId: string;
  inputKey: string;
  defaultPolicy: Exclude<WorkflowInputDefaultPolicy, 'template'>;
  resourceKind?: WorkflowResourceKind;
  status: WorkflowBindingStatus;
};
