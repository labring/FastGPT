import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

export const shouldFilterAiValue = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return true;
  if (item.text?.content?.trim() || item.reasoning?.content?.trim()) return false;
  if (!item.text && !item.reasoning) return false;

  return !(
    item.tools?.length ||
    item.tool ||
    item.skills?.length ||
    item.interactive ||
    item.plan ||
    item.planStatus ||
    item.agentPlanUpdate ||
    item.agentAsk ||
    item.agentStopGate ||
    item.contextCheckpoint
  );
};
