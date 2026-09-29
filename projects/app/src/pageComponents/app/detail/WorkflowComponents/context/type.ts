import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Node, Edge } from '@xyflow/react';

export type WorkflowStateType = {
  nodes: Node<FlowNodeItemType>[];
  edges: Edge[];
  chatConfig: AppChatConfigType;
};
