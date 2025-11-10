import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { Node, Edge } from 'reactflow';
import { z } from 'zod';

export type WorkflowStateType = {
  nodes: Node[];
  edges: Edge[];
  chatConfig: AppChatConfigType;
};
