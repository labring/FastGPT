import { describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  buildAgentLoopCoreAskMemories,
  buildAgentLoopCoreDoneMemories,
  buildAgentLoopCoreProviderStateMemories,
  getAgentLoopCoreMemoryKeys,
  getAgentLoopCorePiAgentMemoryProviderState,
  getAgentLoopCorePiMessagesMemoryKey,
  prepareAgentLoopCoreProviderRunState,
  readAgentLoopCoreProviderStateMemory
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';

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

  it('detects fastAgent ask resume from pending main context', () => {
    const providerState = {
      pendingMainContext: {
        askToolCallId: 'call_ask'
      }
    };

    expect(
      prepareAgentLoopCoreProviderRunState({
        provider: 'fastAgent',
        restoredProviderState: providerState,
        histories: [],
        nodeId: 'node_1',
        hasLastInteractive: true
      })
    ).toEqual({
      piMessagesKey: 'piMessages-node_1',
      providerState,
      isAskResume: true
    });
  });

  it('does not resume fastAgent ask without pending main context', () => {
    expect(
      prepareAgentLoopCoreProviderRunState({
        provider: 'fastAgent',
        restoredProviderState: {},
        histories: [],
        nodeId: 'node_1',
        hasLastInteractive: true
      }).isAskResume
    ).toBe(false);
  });

  it('restores piAgent raw messages from the legacy piMessages memory key', () => {
    const piMessagesKey = getAgentLoopCorePiMessagesMemoryKey('node_1');
    const piMessages = [{ role: 'assistant', content: 'question' }];
    const histories = [
      {
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          [piMessagesKey]: piMessages
        }
      }
    ] satisfies ChatItemMiniType[];

    expect(
      prepareAgentLoopCoreProviderRunState({
        provider: 'piAgent',
        restoredProviderState: {
          pendingAsk: {
            reason: 'need info',
            blockerType: 'missing_required_input',
            question: 'Which dataset should I use?',
            options: ['Dataset A', 'Dataset B']
          }
        },
        histories,
        nodeId: 'node_1',
        hasLastInteractive: true
      })
    ).toEqual({
      piMessagesKey,
      providerState: {
        pendingAsk: {
          reason: 'need info',
          blockerType: 'missing_required_input',
          question: 'Which dataset should I use?',
          options: ['Dataset A', 'Dataset B']
        },
        piMessages
      },
      isAskResume: true
    });
  });

  it('keeps piAgent raw messages out of providerState memory', () => {
    expect(
      getAgentLoopCorePiAgentMemoryProviderState({
        pendingAskId: 'call_ask',
        piMessages: [{ role: 'assistant', content: 'question' }]
      })
    ).toEqual({
      pendingAskId: 'call_ask'
    });
  });

  it('builds ask memories with split piAgent providerState and raw messages', () => {
    expect(
      buildAgentLoopCoreAskMemories({
        provider: 'piAgent',
        nodeId: 'node_1',
        providerState: {
          pendingAskId: 'call_ask',
          piMessages: [{ role: 'assistant', content: 'question' }]
        },
        piMessagesKey: 'piMessages-node_1'
      })
    ).toEqual({
      'agentLoopMemory-node_1': {
        providerState: {
          pendingAskId: 'call_ask'
        }
      },
      'piMessages-node_1': [{ role: 'assistant', content: 'question' }]
    });
  });

  it('clears providerState on done while preserving piAgent raw messages', () => {
    expect(
      buildAgentLoopCoreDoneMemories({
        provider: 'piAgent',
        nodeId: 'node_1',
        providerState: {
          pendingAskId: 'call_ask',
          piMessages: [{ role: 'assistant', content: 'final' }]
        },
        piMessagesKey: 'piMessages-node_1'
      })
    ).toEqual({
      'agentLoopMemory-node_1': undefined,
      'piMessages-node_1': [{ role: 'assistant', content: 'final' }]
    });
  });
});
