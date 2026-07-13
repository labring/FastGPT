import { appendAgentLoopCoreAssistantResponseFromEvent } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
import { describe, expect, it } from 'vitest';

describe('appendAgentLoopCoreAssistantResponseFromEvent', () => {
  it('stores only the latest complete plan snapshot by planId', () => {
    const assistantResponses: any[] = [];

    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event: {
        type: 'plan_operation',
        operation: 'set_plan',
        success: true,
        message: 'plan created',
        plan: {
          planId: 'plan_1',
          name: 'Research FastGPT',
          description: 'Collect and summarize architecture details',
          steps: [
            {
              id: 'step_1',
              name: 'Collect context',
              status: 'in_progress'
            }
          ]
        }
      }
    });
    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event: {
        type: 'plan_operation',
        operation: 'update_steps',
        success: true,
        message: 'plan updated',
        plan: {
          planId: 'plan_1',
          name: 'Research FastGPT',
          description: 'Collect and summarize architecture details',
          steps: [
            {
              id: 'step_1',
              name: 'Collect context',
              status: 'done',
              note: 'Architecture collected'
            }
          ]
        }
      }
    });

    expect(assistantResponses).toEqual([
      {
        plan: {
          planId: 'plan_1',
          name: 'Research FastGPT',
          description: 'Collect and summarize architecture details',
          steps: [
            {
              id: 'step_1',
              name: 'Collect context',
              status: 'done',
              note: 'Architecture collected'
            }
          ]
        },
        planStatus: undefined
      }
    ]);
  });

  it('stores plan operations as update_plan assistant responses', () => {
    const assistantResponses: any[] = [];

    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event: {
        type: 'plan_operation',
        operation: 'set_plan',
        success: false,
        message: 'plan created',
        id: 'call_plan',
        params: '{"action":"set_plan"}'
      },
      names: {
        updatePlanToolName: 'agent_update_plan'
      }
    });
    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event: {
        type: 'plan_operation',
        operation: 'update_steps',
        success: false,
        message: 'plan updated',
        id: 'call_plan',
        params: '{"action":"update_steps"}'
      },
      names: {
        updatePlanToolName: 'agent_update_plan'
      }
    });

    expect(assistantResponses).toEqual([
      {
        id: 'call_plan',
        agentPlanUpdate: {
          id: 'call_plan',
          functionName: 'agent_update_plan',
          params: '{"action":"update_steps"}',
          response: 'plan updated'
        }
      }
    ]);
  });

  it('stores ask_start with askId and custom tool name', () => {
    const assistantResponses: any[] = [];

    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event: {
        type: 'ask_start',
        id: 'call_ask',
        params: '{"question":"Need input?"}',
        ask: {
          reason: 'Need confirmation',
          blockerType: 'ambiguous_goal',
          question: 'Need input?',
          options: ['A', 'B']
        }
      },
      names: {
        askToolName: 'agent_ask_user'
      }
    });

    expect(assistantResponses).toEqual([
      {
        id: 'call_ask',
        agentAsk: {
          id: 'call_ask',
          askId: 'call_ask',
          functionName: 'agent_ask_user',
          params: '{"question":"Need input?"}'
        }
      }
    ]);
  });

  it('stores checkpoint and upserts stop_gate values by id', () => {
    const assistantResponses: any[] = [];

    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event: {
        type: 'after_message_compress',
        requestIds: ['req_1'],
        seconds: 0.1,
        contextCheckpoint: '<context_checkpoint>compressed</context_checkpoint>'
      }
    });
    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event: {
        type: 'stop_gate',
        id: 'stop_gate',
        reason: 'not done',
        feedback: 'keep going'
      }
    });
    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event: {
        type: 'stop_gate',
        id: 'stop_gate',
        reason: 'still not done',
        feedback: 'keep going'
      }
    });

    expect(assistantResponses).toEqual([
      {
        contextCheckpoint: '<context_checkpoint>compressed</context_checkpoint>',
        hideInUI: true
      },
      {
        id: 'stop_gate',
        agentStopGate: {
          id: 'stop_gate',
          reason: 'still not done',
          feedback: 'keep going'
        },
        hideInUI: true
      }
    ]);
  });
});
