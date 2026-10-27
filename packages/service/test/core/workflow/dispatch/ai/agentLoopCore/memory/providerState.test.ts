import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  buildAgentLoopCorePausedMemories,
  buildAgentLoopCoreDoneMemories,
  buildAgentLoopCoreProviderStateMemories,
  getAgentLoopCoreMemoryKeys,
  prepareAgentLoopCoreProviderRunState,
  readAgentLoopCoreProviderStateMemory
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/memory/providerState';
import { WorkflowMemoryState } from '@fastgpt/service/core/workflow/dispatch/utils/memories';

const runningAppInfo = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app_1',
  teamId: 'team_1',
  tmbId: 'tmb_1',
  name: 'Test App'
};

describe('agentLoopCore providerState memory', () => {
  it('reads memory from the last AI history item using unified key', () => {
    const keys = getAgentLoopCoreMemoryKeys({
      runningAppInfo,
      nodeId: 'node_1'
    });
    expect(keys.memoryKey).toBe('app:app_1:node_1');

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

    expect(
      readAgentLoopCoreProviderStateMemory({
        histories,
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual(memory);
  });

  it('compatibly reads legacy agentLoopMemory-${nodeId} key', () => {
    const memory = {
      providerState: {
        pendingMainContext: {
          askToolCallId: 'call_legacy',
          messages: [{ role: 'assistant' as const, content: 'question' }]
        }
      }
    };
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          'agentLoopMemory-node_1': memory
        }
      }
    ];

    expect(
      readAgentLoopCoreProviderStateMemory({
        histories,
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual(memory);
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
    const memory = readAgentLoopCoreProviderStateMemory({
      histories,
      runningAppInfo,
      nodeId: 'node_1'
    });
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
          'app:app_1:node_1': {
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

    expect(
      readAgentLoopCoreProviderStateMemory({
        histories,
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual({});
  });

  it('builds unified and scoped memory keys for the current node', () => {
    const providerState = {
      askToolCallId: 'call_ask',
      messages: [{ role: 'assistant' as const, content: 'question' }]
    };

    expect(
      buildAgentLoopCoreProviderStateMemories({
        runningAppInfo,
        nodeId: 'node_1',
        memory: {
          providerState
        }
      })
    ).toEqual({
      'app:app_1:node_1': {
        providerState
      }
    });

    const scopedState = WorkflowMemoryState.fromHistories([]).fork('node:parent_agent');
    expect(
      buildAgentLoopCoreProviderStateMemories({
        memoryState: scopedState,
        runningAppInfo,
        nodeId: 'node_1',
        memory: {
          providerState
        }
      })
    ).toEqual({
      'node:parent_agent/app:app_1:node_1': {
        providerState
      }
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

  it('writes complete piAgent state only to unified providerState memory on pause', () => {
    const providerState = {
      pendingMainContext: {
        askToolCallId: 'call_ask',
        messages: [{ role: 'assistant', content: 'question' }]
      }
    };

    expect(
      buildAgentLoopCorePausedMemories({
        runningAppInfo,
        nodeId: 'node_1',
        providerState
      })
    ).toEqual({
      'app:app_1:node_1': {
        providerState
      }
    });
  });

  it('clears providerState on done', () => {
    expect(
      buildAgentLoopCoreDoneMemories({
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual({
      'app:app_1:node_1': undefined
    });
  });

  it('respects history === 0 in readAgentLoopCoreProviderStateMemory', () => {
    const parentMemoryState = WorkflowMemoryState.fromRecord({
      'app:app_1:node_1': {
        providerState: {
          pendingMainContext: { askToolCallId: 'from_session' }
        }
      }
    });

    expect(
      readAgentLoopCoreProviderStateMemory({
        memoryState: parentMemoryState,
        history: 0,
        histories: [],
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual({});

    expect(
      readAgentLoopCoreProviderStateMemory({
        memoryState: parentMemoryState,
        history: 6,
        histories: [],
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual({
      providerState: {
        pendingMainContext: { askToolCallId: 'from_session' }
      }
    });
  });
});
