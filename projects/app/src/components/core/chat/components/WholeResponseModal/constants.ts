import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

export const agentPlanStatusMap: Record<
  NonNullable<ChatHistoryItemResType['agentPlanStatus']>,
  string
> = {
  set_plan: i18nT('chat:agent_plan_status_set_plan'),
  update_plan: i18nT('chat:agent_plan_status_update_plan'),
  ask_question: i18nT('chat:agent_plan_status_ask_question')
};
