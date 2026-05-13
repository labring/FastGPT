import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../../../../../web/i18n/utils';

const MASTER_AGENT_MODULE_NAME = i18nT('chat:master_agent_call');

export const hasErrorNodeResponse = (nodeResponses: ChatHistoryItemResType[] = []) =>
  nodeResponses.some((item) => !!item.error || !!item.errorText);

const isEmptyMasterAgentNodeResponse = (nodeResponse: ChatHistoryItemResType) => {
  if (nodeResponse.moduleType !== FlowNodeTypeEnum.agent) return false;
  if (nodeResponse.moduleName !== MASTER_AGENT_MODULE_NAME) return false;

  if (nodeResponse.textOutput) return false;
  if (nodeResponse.reasoningText) return false;
  if (nodeResponse.error || nodeResponse.errorText) return false;
  if (nodeResponse.agentPlanStatus) return false;
  if (nodeResponse.toolInput || nodeResponse.toolRes) return false;
  if (nodeResponse.toolCallInputTokens || nodeResponse.toolCallOutputTokens) return false;
  if (nodeResponse.toolDetail?.length) return false;
  if (nodeResponse.quoteList?.length) return false;
  if (nodeResponse.finishReason === 'tool_calls') return false;
  if (nodeResponse.finishReason === 'error') return false;

  return true;
};

export const filterFailedAgentNodeResponses = (nodeResponses: ChatHistoryItemResType[] = []) =>
  nodeResponses.filter((item) => !isEmptyMasterAgentNodeResponse(item));
