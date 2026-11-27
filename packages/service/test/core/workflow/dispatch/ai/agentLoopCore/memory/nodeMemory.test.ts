import { describe, expect, it } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { buildAgentLoopCoreDoneMemories } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/memory/nodeMemory';
import { WorkflowMemoryContext } from '@fastgpt/service/core/workflow/dispatch/context/memory';

const runningAppInfo = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app_1',
  teamId: 'team_1',
  tmbId: 'tmb_1',
  name: 'Test App'
};

describe('agentLoopCore node memory helpers', () => {
  it('creates done memories to clear node snapshots across root and scoped keys', () => {
    expect(
      buildAgentLoopCoreDoneMemories({
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual({
      'app:app_1:node_1': undefined
    });

    const scopedState = WorkflowMemoryContext.fromHistories([]).fork('node:parent_agent');
    expect(
      buildAgentLoopCoreDoneMemories({
        memoryContext: scopedState,
        runningAppInfo,
        nodeId: 'node_1'
      })
    ).toEqual({
      'node:parent_agent/app:app_1:node_1': undefined
    });
  });
});
