import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  buildAgentLoopCorePausedMemories,
  buildAgentLoopCoreDoneMemories,
  prepareAgentLoopCoreProviderRunState,
  readAgentLoopCoreProviderStateMemory
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/memory/providerState';
import { WorkflowMemoryState } from '@fastgpt/service/core/workflow/memory/state';

const runningAppInfo = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app_1',
  teamId: 'team_1',
  tmbId: 'tmb_1',
  name: 'Test App'
};

describe('agentLoopCore providerState memory', () => {
  it('reads memory from the last AI history item using unified and legacy keys', () => {
    const memory = {
      providerState: {
        pendingMainContext: {
          askToolCallId: 'call_ask',
          messages: [{ role: 'assistant' as const, content: 'question' }]
        }
      }
    };

    // 1. Unified canonical key
    expect(
      readAgentLoopCoreProviderStateMemory({
        histories: [
          { obj: ChatRoleEnum.Human, value: [{ text: { content: 'hello' } }] },
          { obj: ChatRoleEnum.AI, value: [], memories: { 'app:app_1:node_1': memory } }
        ],
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual(memory);

    // 2. Legacy agentLoopMemory key fallback
    expect(
      readAgentLoopCoreProviderStateMemory({
        histories: [
          { obj: ChatRoleEnum.AI, value: [], memories: { 'agentLoopMemory-node_1': memory } }
        ],
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

  it('writes complete piAgent state to unified and scoped providerState memories on pause', () => {
    const providerState = {
      pendingMainContext: {
        askToolCallId: 'call_ask',
        messages: [{ role: 'assistant' as const, content: 'question' }]
      }
    };

    // 1. Root unified key
    expect(
      buildAgentLoopCorePausedMemories({
        runningAppInfo,
        nodeId: 'node_1',
        providerState
      })
    ).toEqual({
      'app:app_1:node_1': { providerState }
    });

    // 2. Scoped key
    const scopedState = WorkflowMemoryState.fromHistories([]).fork('node:parent_agent');
    expect(
      buildAgentLoopCorePausedMemories({
        memoryState: scopedState,
        runningAppInfo,
        nodeId: 'node_1',
        providerState
      })
    ).toEqual({
      'node:parent_agent/app:app_1:node_1': { providerState }
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

  it.each([0, []])(
    'restores the nested checkpoint with history=%j only during interactive resume',
    (history) => {
      const providerState = {
        pendingMainContext: {
          askToolCallId: 'nested-ask',
          messages: [{ role: 'assistant', content: 'waiting' }]
        },
        piMessages: [{ role: 'assistant', content: 'nested tool state' }]
      };
      const memoryState = WorkflowMemoryState.fromRecord(
        {
          'node:parent_agent/app:app_1:node_1': { providerState }
        },
        { rootSource: { ...runningAppInfo, sourceId: 'parent-app' } }
      )
        .fork('node:parent_agent')
        .fork('app:app_1');

      expect(
        readAgentLoopCoreProviderStateMemory({
          memoryState,
          runningAppInfo,
          nodeId: 'node_1',
          history,
          histories: []
        })
      ).toEqual({});
      expect(
        readAgentLoopCoreProviderStateMemory({
          memoryState,
          runningAppInfo,
          nodeId: 'node_1',
          history,
          histories: [],
          hasInteractiveResume: true
        })
      ).toEqual({ providerState });
    }
  );

  it('reads from memoryState for numeric history and prefers custom histories when provided', () => {
    const sessionMemory = { providerState: { origin: 'session' } };
    const customMemory = { providerState: { origin: 'custom' } };
    const memoryState = WorkflowMemoryState.fromRecord({
      'app:app_1:node_1': sessionMemory
    });

    // 1. Numeric history reads from memoryState
    expect(
      readAgentLoopCoreProviderStateMemory({
        memoryState,
        runningAppInfo,
        nodeId: 'node_1',
        history: 6,
        histories: []
      })
    ).toEqual(sessionMemory);

    // 2. Custom histories array overrides memoryState
    expect(
      readAgentLoopCoreProviderStateMemory({
        memoryState,
        runningAppInfo,
        nodeId: 'node_1',
        history: [
          { obj: ChatRoleEnum.AI, value: [], memories: { 'app:app_1:node_1': customMemory } }
        ],
        histories: []
      })
    ).toEqual(customMemory);
  });
});
