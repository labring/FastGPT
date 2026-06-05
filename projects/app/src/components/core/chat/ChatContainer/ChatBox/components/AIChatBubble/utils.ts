import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

export const hasAiAnswerContent = (item: AIChatItemValueItemType) =>
  Boolean(item.text?.content?.trim());

export const hasAiInteractiveContent = (item: AIChatItemValueItemType) => Boolean(item.interactive);

export const hasAiProcessingContent = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return false;

  const tools = item.tools || (item.tool ? [item.tool] : undefined);
  return Boolean(
    (item.reasoning?.content && !item.hideReason) ||
      tools?.length ||
      item.skills?.length ||
      item.plan ||
      item.planStatus?.status === 'generating'
  );
};

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
