import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { readAgentLoopCoreActivePlan } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/context/activePlan';
import { describe, expect, it } from 'vitest';

const createPlanHistory = (
  plan: {
    planId: string;
    name: string;
    steps: Array<{
      id: string;
      name: string;
      status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'skipped';
    }>;
  } | null
): ChatItemMiniType => ({
  obj: ChatRoleEnum.AI,
  value: [{ plan }]
});

describe('readAgentLoopCoreActivePlan', () => {
  it('returns the latest unfinished plan from history', () => {
    const histories = [
      createPlanHistory({
        planId: 'plan_1',
        name: 'Old plan',
        steps: [{ id: 'step_1', name: 'Old step', status: 'blocked' }]
      }),
      createPlanHistory({
        planId: 'plan_2',
        name: 'Current plan',
        steps: [{ id: 'step_2', name: 'Continue', status: 'in_progress' }]
      })
    ];

    expect(readAgentLoopCoreActivePlan({ histories })).toMatchObject({
      planId: 'plan_2'
    });
  });

  it('treats null as a terminal marker', () => {
    const histories = [
      createPlanHistory({
        planId: 'plan_1',
        name: 'Old unfinished plan',
        steps: [{ id: 'step_1', name: 'Continue', status: 'in_progress' }]
      }),
      createPlanHistory(null)
    ];

    expect(readAgentLoopCoreActivePlan({ histories })).toBeUndefined();
  });

  it('stops at a completed plan without restoring an older plan', () => {
    const histories = [
      createPlanHistory({
        planId: 'plan_1',
        name: 'Old unfinished plan',
        steps: [{ id: 'step_1', name: 'Continue', status: 'pending' }]
      }),
      createPlanHistory({
        planId: 'plan_1',
        name: 'Completed plan',
        steps: [{ id: 'step_1', name: 'Continue', status: 'done' }]
      })
    ];

    expect(readAgentLoopCoreActivePlan({ histories })).toBeUndefined();
  });

  it('ignores agentPlanUpdate records when reading runtime state', () => {
    const histories: ChatItemMiniType[] = [
      createPlanHistory({
        planId: 'plan_1',
        name: 'Runtime plan',
        steps: [{ id: 'step_1', name: 'Continue', status: 'in_progress' }]
      }),
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            agentPlanUpdate: {
              id: 'call_update',
              functionName: 'update_plan',
              params: '{}',
              response: 'updated'
            }
          }
        ]
      }
    ];

    expect(readAgentLoopCoreActivePlan({ histories })).toMatchObject({
      planId: 'plan_1'
    });
  });
});
