import { AppSchema } from '@fastgpt/global/core/app/type';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type';
import { RuntimeEdgeItemType, StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

export type PostWorkflowDebugProps = {
  nodes: RuntimeNodeItemType[];
  edges: RuntimeEdgeItemType[];
  variables: Record<string, any>;
  appId: string;
};

export type PostWorkflowDebugResponse = {
  finishedNodes: RuntimeNodeItemType[];
  finishedEdges: RuntimeEdgeItemType[];
  nextStepRunNodes: RuntimeNodeItemType[];
  flowResponses: ChatHistoryItemResType[];
  newVariables: Record<string, any>;
};
