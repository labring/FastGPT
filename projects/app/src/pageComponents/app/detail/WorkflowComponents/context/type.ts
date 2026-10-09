import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Node, Edge } from '@xyflow/react';

export type FastGPTWorkflowNode<T extends string | undefined = string | undefined> = Node<
  FlowNodeItemType,
  T
>;

export type WorkflowStateType = {
  nodes: FastGPTWorkflowNode[];
  edges: Edge[];
  chatConfig: AppChatConfigType;
};
