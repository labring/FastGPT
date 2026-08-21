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
  type: 'agentAsk',
  askId,
  params: {
    description: ask.reason,
    questions: ask.questions.map((question) => ({
      ...question,
      // Initialize the initial state
      answer: ''
    }))
  }
});
