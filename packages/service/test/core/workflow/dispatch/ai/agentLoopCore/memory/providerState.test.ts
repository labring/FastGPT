import { describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  buildAgentLoopCorePausedMemories,
  buildAgentLoopCoreDoneMemories,
  buildAgentLoopCoreProviderStateMemories,
  getAgentLoopCoreMemoryKeys,
  getAgentLoopCorePiMessagesMemoryKey,
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

  it('wraps legacy pendingMainContext as fastAgent providerState and migrates its plan', () => {
    const histories = [
      {
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          'agentLoopMemory-node_1': {
            pendingMainContext: {
              askToolCallId: 'call_ask',
              messages: [{ role: 'assistant', content: 'question' }],
              activePlan: {
                planId: 'legacy-plan',
                task: 'Legacy plan',
                description: 'Legacy description',
                steps: [{ id: 'step_1', title: 'Legacy step', status: 'in_progress' }]
              }
            }
          }
        }
      }
    ] satisfies ChatItemMiniType[];

    expect(readAgentLoopCoreProviderStateMemory({ histories, nodeId: 'node_1' })).toEqual({
      providerState: {
        pendingMainContext: {
          askToolCallId: 'call_ask',
          messages: [{ role: 'assistant', content: 'question' }],
          activePlan: {
            planId: 'legacy-plan',
            name: 'Legacy plan',
            description: 'Legacy description',
            steps: [{ id: 'step_1', name: 'Legacy step', status: 'in_progress' }]
          }
        }
      }
    });
  });

  it('keeps a malformed legacy active plan from blocking ask resume', () => {
    const histories = [
      {
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          'agentLoopMemory-node_1': {
            pendingMainContext: {
              askToolCallId: 'call_ask',
              messages: [],
              activePlan: { planId: 'broken', steps: [] }
            }
          }
        }
      }
    ] satisfies ChatItemMiniType[];

    const memory = readAgentLoopCoreProviderStateMemory({ histories, nodeId: 'node_1' });
    expect(memory).toEqual({
      providerState: {
        pendingMainContext: {
          askToolCallId: 'call_ask',
          messages: [],
          activePlan: undefined
        }
      }
    });
    expect(
      prepareAgentLoopCoreProviderRunState({
        provider: 'fastAgent',
        restoredProviderState: memory.providerState,
        histories,
        nodeId: 'node_1',
        hasLastInteractive: true
      }).isAskResume
    ).toBe(true);
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

  it('prefers unified piAgent providerState over legacy raw messages', () => {
    const piMessagesKey = getAgentLoopCorePiMessagesMemoryKey('node_1');
    const unifiedPiMessages: unknown[] = [];
    const histories = [
      {
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          [piMessagesKey]: [{ role: 'assistant', content: 'legacy question' }]
        }
      }
    ] satisfies ChatItemMiniType[];

    expect(
      prepareAgentLoopCoreProviderRunState({
        provider: 'piAgent',
        restoredProviderState: {
          piMessages: unifiedPiMessages
        },
        histories,
        nodeId: 'node_1',
        hasLastInteractive: true
      })
    ).toEqual({
      piMessagesKey,
      providerState: {
        piMessages: unifiedPiMessages
      },
      isAskResume: false
    });
  });

  it('writes complete piAgent state only to unified providerState memory on pause', () => {
    const providerState = {
      pendingAskId: 'call_ask',
      piMessages: [{ role: 'assistant', content: 'question' }]
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

  it('clears providerState and piAgent raw messages on done', () => {
    expect(
      buildAgentLoopCoreDoneMemories({
        provider: 'piAgent',
        nodeId: 'node_1',
        piMessagesKey: 'piMessages-node_1'
      })
    ).toEqual({
      'agentLoopMemory-node_1': undefined,
      'piMessages-node_1': undefined
    });
  });
});
