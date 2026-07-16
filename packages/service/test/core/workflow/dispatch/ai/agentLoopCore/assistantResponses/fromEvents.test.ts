import { appendAgentLoopCoreAssistantResponseFromEvent } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/assistantResponses/fromEvents';
import { describe, expect, it } from 'vitest';

describe('appendAgentLoopCoreAssistantResponseFromEvent', () => {
  it('updates the standalone plan snapshot while retaining tool history', () => {
    const assistantResponses: any[] = [];

    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event: {
        type: 'plan_operation',
        operation: 'set_plan',
        success: true,
        message: 'plan created',
        id: 'call_plan_create',
        params: '{"name":"Research FastGPT","steps":["Collect context"]}',
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
        id: 'call_plan_update',
        params: '{"updates":[{"id":"step_1","status":"done"}]}',
        plan: {
          planId: 'plan_2',
          name: 'Publish FastGPT research',
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
        plan: expect.objectContaining({
          planId: 'plan_2',
          steps: [expect.objectContaining({ status: 'done' })]
        })
      },
      {
        id: 'call_plan_create',
        agentPlanUpdate: {
          id: 'call_plan_create',
          functionName: 'set_plan',
          params: '{"name":"Research FastGPT","steps":["Collect context"]}',
          response: 'plan created'
        }
      },
      {
        id: 'call_plan_update',
        agentPlanUpdate: {
          id: 'call_plan_update',
          functionName: 'update_plan',
          params: '{"updates":[{"id":"step_1","status":"done"}]}',
          response: 'plan updated'
        }
      }
    ]);
  });

  it('stores plan operations with their actual tool names', () => {
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
        setPlanToolName: 'agent_set_plan',
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
        setPlanToolName: 'agent_set_plan',
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

  it('stores context checkpoints', () => {
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
    expect(assistantResponses).toEqual([
      {
        contextCheckpoint: '<context_checkpoint>compressed</context_checkpoint>',
        hideInUI: true
      }
    ]);
  });
});
