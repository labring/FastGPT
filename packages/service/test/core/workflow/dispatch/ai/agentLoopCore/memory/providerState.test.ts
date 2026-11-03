import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
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
  it('unwraps providerState from canonical or legacy AI history and ignores unwrapped legacy Ask memory', () => {
    const memory = {
      providerState: {
        pendingMainContext: {
          askToolCallId: 'call_ask',
          messages: [{ role: 'assistant' as const, content: 'question' }]
        }
      }
    };

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

    expect(
      readAgentLoopCoreProviderStateMemory({
        histories: [
          { obj: ChatRoleEnum.AI, value: [], memories: { 'agentLoopMemory-node_1': memory } }
        ],
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual(memory);

    const unwrappedLegacy = readAgentLoopCoreProviderStateMemory({
      histories: [
        {
          obj: ChatRoleEnum.AI,
          value: [],
          memories: {
            'agentLoopMemory-node_1': {
              pendingMainContext: { askToolCallId: 'legacy-call', messages: [] }
            }
          }
        }
      ],
      runningAppInfo,
      nodeId: 'node_1'
    });
    expect(unwrappedLegacy.providerState).toBeUndefined();
    expect(
      prepareAgentLoopCoreProviderRunState({
        restoredProviderState: unwrappedLegacy.providerState,
        hasLastInteractive: true
      }).isAskResume
    ).toBe(false);
  });

  it('writes and clears piAgent providerState memories across root and scoped keys', () => {
    const providerState = {
      pendingMainContext: {
        askToolCallId: 'call_ask',
        messages: [{ role: 'assistant' as const, content: 'question' }]
      }
    };

    expect(
      buildAgentLoopCorePausedMemories({
        runningAppInfo,
        nodeId: 'node_1',
        providerState
      })
    ).toEqual({
      'app:app_1:node_1': { providerState }
    });

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

    expect(
      buildAgentLoopCoreDoneMemories({
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual({
      'app:app_1:node_1': undefined
    });
  });

  it('detects ask resume only when pendingMainContext and hasLastInteractive are both present', () => {
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

    expect(
      prepareAgentLoopCoreProviderRunState({
        restoredProviderState: {},
        hasLastInteractive: true
      }).isAskResume
    ).toBe(false);
  });

  it('persists and restores paused assistantResponses alongside providerState', () => {
    const providerState = {
      pendingMainContext: {
        askToolCallId: 'call_ask'
      }
    };
    const assistantResponses = [{ text: { content: 'before ask ' } }];

    const pausedMemories = buildAgentLoopCorePausedMemories({
      runningAppInfo,
      nodeId: 'node_1',
      providerState,
      assistantResponses
    });
    expect(pausedMemories).toEqual({
      'app:app_1:node_1': {
        providerState,
        assistantResponses
      }
    });

    expect(
      readAgentLoopCoreProviderStateMemory({
        histories: [
          {
            obj: ChatRoleEnum.AI,
            value: [],
            memories: pausedMemories
          }
        ],
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual({
      providerState,
      assistantResponses
    });
  });
});
