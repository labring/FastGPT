import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  buildSkillEditAgentLoopMemories,
  createSkillEditAskInteractive,
  getSkillEditAgentLoopMemoryKey,
  readSkillEditAgentLoopMemory
} from '@fastgpt/service/core/ai/auxiliaryGeneration/skillEdit/utils';
import { describe, expect, it } from 'vitest';

describe('skillEdit agent loop memory helpers', () => {
  it('keeps the stable node id when storing and restoring pending context', () => {
    const memoryKey = getSkillEditAgentLoopMemoryKey();
    const pendingMainContext = {
      messages: [],
      askToolCallId: memoryKey
    };
    const memories = buildSkillEditAgentLoopMemories({ pendingMainContext });

    expect(memoryKey).toBe('agentLoopMemory-skill-debug-agent');
    expect(
      readSkillEditAgentLoopMemory({
        histories: [
          {
            obj: ChatRoleEnum.Human,
            value: []
          },
          {
            obj: ChatRoleEnum.AI,
            value: [],
            memories
          }
        ] as any
      })
    ).toEqual({ pendingMainContext });
  });

  it('clears completed memory and keeps the usage id on ask interactions', () => {
    expect(buildSkillEditAgentLoopMemories({})).toEqual({
      [getSkillEditAgentLoopMemoryKey()]: undefined
    });
    expect(
      createSkillEditAskInteractive({
        planId: 'plan-id',
        usageId: 'usage-id',
        ask: {
          question: 'Which format?',
          options: ['A', 'B', 'C']
        }
      })
    ).toEqual(
      expect.objectContaining({
        type: 'agentPlanAskQuery',
        planId: 'plan-id',
        usageId: 'usage-id'
      })
    );
  });
});
