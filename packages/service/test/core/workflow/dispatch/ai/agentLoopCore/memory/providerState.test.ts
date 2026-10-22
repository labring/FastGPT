import { describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  buildAgentLoopCorePausedMemories,
  buildAgentLoopCoreDoneMemories,
  buildAgentLoopCoreProviderStateMemories,
  getAgentLoopCoreMemoryKeys,
  prepareAgentLoopCoreProviderRunState,
  readAgentLoopCoreProviderStateMemory
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/memory/providerState';

describe('agentLoopCore providerState memory', () => {
  it('reads memory only from the last AI history item', () => {
    const keys = getAgentLoopCoreMemoryKeys('node_1');
    const memory = {
      providerState: {
        pendingMainContext: {
          askToolCallId: 'call_ask',
          messages: [{ role: 'assistant' as const, content: 'question' }]
        }
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

    expect(readAgentLoopCoreProviderStateMemory({ histories, nodeId: 'node_1' })).toEqual(memory);
  });

  it('ignores legacy unwrapped Ask memory without restoring it', () => {
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          'agentLoopMemory-node_1': {
            pendingMainContext: { askToolCallId: 'legacy-call', messages: [] }
          }
        }
      }
    ];
    const memory = readAgentLoopCoreProviderStateMemory({ histories, nodeId: 'node_1' });
    expect(memory.providerState).toBeUndefined();
    expect(
      prepareAgentLoopCoreProviderRunState({
        restoredProviderState: memory.providerState,
        hasLastInteractive: true
      }).isAskResume
    ).toBe(false);
  });

  it('returns empty memory when the last history item is not AI', () => {
    const histories = [
      {
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          'agentLoopMemory-node_1': {
            providerState: {
              pendingMainContext: {
                askToolCallId: 'old_call',
                messages: [{ role: 'assistant', content: 'old' }]
              }
            }
          }
        }
      },
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'new question' } }]
      }
    ] satisfies ChatItemMiniType[];

    expect(readAgentLoopCoreProviderStateMemory({ histories, nodeId: 'node_1' })).toEqual({});
  });

  it('builds stable memory keys for the current node', () => {
    const providerState = {
      askToolCallId: 'call_ask',
      messages: [{ role: 'assistant' as const, content: 'question' }]
    };

    expect(
      buildAgentLoopCoreProviderStateMemories({
        nodeId: 'node_1',
        memory: {
          providerState
        }
      })
    ).toEqual({
      'agentLoopMemory-node_1': {
        providerState
      }
    });
  });

  it('clears unified memory by writing undefined to the single key', () => {
    expect(
      buildAgentLoopCoreProviderStateMemories({
        nodeId: 'node_1',
        memory: {}
      })
    ).toEqual({
      'agentLoopMemory-node_1': undefined
    });
  });

  it('detects ask resume from pending main context', () => {
    const providerState = {
      pendingMainContext: {
        askToolCallId: 'call_ask'
      }
    };

    expect(
      prepareAgentLoopCoreProviderRunState({
        restoredProviderState: providerState,
        hasLastInteractive: true
      })
    ).toEqual({
      providerState,
      isAskResume: true
    });
  });

  it('does not resume ask without pending main context', () => {
    expect(
      prepareAgentLoopCoreProviderRunState({
        restoredProviderState: {},
        hasLastInteractive: true
      }).isAskResume
    ).toBe(false);
  });

  it('detects standard ask resume from pending main context', () => {
    const providerState = {
      pendingMainContext: {
        askToolCallId: 'call_ask',
        messages: [{ role: 'assistant', content: 'question' }]
      }
    };
    expect(
      prepareAgentLoopCoreProviderRunState({
        restoredProviderState: providerState,
        hasLastInteractive: true
      })
    ).toEqual({
      providerState,
      isAskResume: true
    });
  });

  it('writes complete piAgent state only to unified providerState memory on pause', () => {
    const providerState = {
      pendingMainContext: {
        askToolCallId: 'call_ask',
        messages: [{ role: 'assistant', content: 'question' }]
      }
    };

    expect(
      buildAgentLoopCorePausedMemories({
        nodeId: 'node_1',
        providerState
      })
    ).toEqual({
      'agentLoopMemory-node_1': {
        providerState
      }
    });
  });

  it('clears providerState on done', () => {
    expect(
      buildAgentLoopCoreDoneMemories({
        nodeId: 'node_1'
      })
    ).toEqual({
      'agentLoopMemory-node_1': undefined
    });
  });
});
