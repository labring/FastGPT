import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  buildSkillDebugAgentLoopMemories,
  compactSkillDebugPlanSnapshots,
  getSkillDebugAgentLoopMemoryKey,
  readSkillDebugActivePlan,
  readSkillDebugAgentLoopMemory
} from '@fastgpt/service/core/ai/skill/debugChat/memory';
import { describe, expect, it } from 'vitest';

const unfinishedPlan = {
  planId: 'plan-1',
  name: 'Edit skill',
  steps: [{ id: 'step-1', name: 'Inspect files', status: 'in_progress' as const }]
};

describe('Skill Debug Agent Loop memory', () => {
  it('restores provider state and the latest unfinished plan', () => {
    const histories = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ plan: unfinishedPlan }],
        memories: {
          [getSkillDebugAgentLoopMemoryKey()]: { providerState: { pending: true } }
        }
      }
    ];

    expect(readSkillDebugAgentLoopMemory({ histories })).toEqual({
      providerState: { pending: true }
    });
    expect(readSkillDebugActivePlan({ histories })).toEqual(unfinishedPlan);
  });

  it('uses a completed plan marker to stop restoring older plans', () => {
    expect(
      readSkillDebugActivePlan({
        histories: [
          { obj: ChatRoleEnum.AI, value: [{ plan: unfinishedPlan }] },
          { obj: ChatRoleEnum.AI, value: [{ plan: null }] }
        ]
      })
    ).toBeUndefined();
  });

  it('keeps only the final plan snapshot and clears completed state', () => {
    const responses = compactSkillDebugPlanSnapshots([
      { plan: unfinishedPlan },
      { text: { content: 'done' } },
      {
        plan: {
          ...unfinishedPlan,
          steps: [{ ...unfinishedPlan.steps[0], status: 'done' }]
        }
      }
    ]);

    expect(responses).toEqual([{ text: { content: 'done' } }, { plan: null }]);
    expect(buildSkillDebugAgentLoopMemories()).toEqual({
      [getSkillDebugAgentLoopMemoryKey()]: undefined
    });
  });
});
