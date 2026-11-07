import { describe, expect, it } from 'vitest';
import { AgentAskInteractiveSchema } from '@fastgpt/global/core/ai/agent/type';
import { parseAgentAskArguments } from '@fastgpt/global/core/ai/agent/utils';
import { createAgentLoopCoreAskInteractive } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/interactive/ask';

describe('createAgentLoopCoreAskInteractive', () => {
  it('stores raw arguments once and derives multi-question display data', () => {
    const payload = {
      reason: 'Need input',
      blockerType: 'user_choice',
      questions: ['Confirm?', 'Include examples?'].map((question) => ({
        question,
        options: [
          { summary: 'Yes', value: 'Yes' },
          { summary: 'No', value: 'No' }
        ]
      }))
    };
    const argumentsText = ` \n${JSON.stringify(payload, null, 2)}\n`;
    const interactive = createAgentLoopCoreAskInteractive({
      toolCallId: 'call_ask',
      arguments: argumentsText
    });
    expect(interactive).toEqual({
      type: 'agentAsk',
      params: { toolCallId: 'call_ask', arguments: argumentsText }
    });
    expect(AgentAskInteractiveSchema.safeParse(interactive).success).toBe(true);
    expect(parseAgentAskArguments(interactive.params.arguments)).toEqual(payload);
  });

  it.each(['not JSON', '{}', '{"questions":[]}'])(
    'rejects invalid persisted arguments: %s',
    (argumentsText) => {
      expect(
        AgentAskInteractiveSchema.safeParse({
          type: 'agentAsk',
          params: { toolCallId: 'call_ask', arguments: argumentsText }
        }).success
      ).toBe(false);
    }
  );
});
