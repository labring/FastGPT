import type { AppSchema } from '@fastgpt/global/core/app/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { WorkflowDebugResponse } from '@fastgpt/service/core/workflow/dispatch/type';

export type PostWorkflowDebugProps = {
  nodes: RuntimeNodeItemType[];
  edges: RuntimeEdgeItemType[];
  skipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];
  variables: Record<string, any>;
  appId: string;
  query?: UserChatItemValueItemType[];
  history?: ChatItemType[];
  chatConfig?: AppSchema['chatConfig'];
  usageId?: string;
};

export type PostWorkflowDebugResponse = WorkflowDebugResponse & {
  newVariables: Record<string, any>;
  usageId: string;
};
