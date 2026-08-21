import { AgentPlanReadSchema, type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { hasUnfinishedAgentPlan } from '@fastgpt/global/core/ai/agent/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';

/**
 * 从完整聊天历史中读取最后一条 plan 状态。
 * 未完成计划会恢复为运行时 activePlan；完成计划或 null 终止标记都会停止继续向前查找。
 */
export const readAgentLoopCoreActivePlan = ({
  histories
}: {
  histories: ChatItemMiniType[];
}): AgentPlanType | undefined => {
  for (let historyIndex = histories.length - 1; historyIndex >= 0; historyIndex--) {
    const history = histories[historyIndex];
    if (history.obj !== ChatRoleEnum.AI) continue;

    for (let valueIndex = history.value.length - 1; valueIndex >= 0; valueIndex--) {
      const value = history.value[valueIndex];
      if (!Object.prototype.hasOwnProperty.call(value, 'plan')) continue;
      if (value.plan === null) return;

      const parsedPlan = AgentPlanReadSchema.safeParse(value.plan);
      if (!parsedPlan.success) return;
      return hasUnfinishedAgentPlan(parsedPlan.data) ? parsedPlan.data : undefined;
    }
  }
};
