import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentAskPayload } from '../../../../../../ai/llm/agentLoop/interface';

/**
 * 将 agent-loop 的 ask_user 暂停转换成 workflow interactive。
 */
export const createAgentLoopCoreAskInteractive = ({
  askId,
  ask
}: {
  askId: string;
  ask: AgentAskPayload;
}): InteractiveNodeResponseType => ({
  type: 'agentPlanAskQuery',
  askId,
  params: {
    content: ask.question,
    reason: ask.reason,
    blockerType: ask.blockerType,
    options: ask.options
  }
});
