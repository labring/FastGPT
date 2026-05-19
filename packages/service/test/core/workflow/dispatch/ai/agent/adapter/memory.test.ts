import { describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  buildWorkflowAgentLoopMemories,
  getWorkflowAgentLoopMemoryKeys,
  readWorkflowAgentLoopMemory
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/memory';

describe('workflow agent loop memory adapter', () => {
  it('reads memory only from the last AI history item', () => {
    const keys = getWorkflowAgentLoopMemoryKeys('node_1');
    const memory = {
      pendingMainContext: {
        askToolCallId: 'call_ask',
        messages: [{ role: 'assistant' as const, content: 'question' }]
      }
    };
    const histories = [
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'hello' } }]
      },
      {
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          [keys.memoryKey]: memory
        }
      }
    ] satisfies ChatItemMiniType[];

    expect(readWorkflowAgentLoopMemory({ histories, nodeId: 'node_1' })).toEqual(memory);
  });

  it('returns empty memory when the last history item is not AI', () => {
    const histories = [
      {
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          'agentLoopMemory-node_1': {
            pendingMainContext: {
              askToolCallId: 'old_call',
              messages: [{ role: 'assistant', content: 'old' }]
            }
          }
        }
      },
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'new question' } }]
      }
    ] satisfies ChatItemMiniType[];

    expect(readWorkflowAgentLoopMemory({ histories, nodeId: 'node_1' })).toEqual({});
  });

  it('builds stable memory keys for the current node', () => {
    const pendingMainContext = {
      askToolCallId: 'call_ask',
      messages: [{ role: 'assistant' as const, content: 'question' }]
    };

    expect(
      buildWorkflowAgentLoopMemories({
        nodeId: 'node_1',
        memory: {
          pendingMainContext
        }
      })
    ).toEqual({
      'agentLoopMemory-node_1': {
        pendingMainContext
      }
    });
  });

  it('clears unified memory by writing undefined to the single key', () => {
    expect(
      buildWorkflowAgentLoopMemories({
        nodeId: 'node_1',
        memory: {}
      })
    ).toEqual({
      'agentLoopMemory-node_1': undefined
    });
  });
});
