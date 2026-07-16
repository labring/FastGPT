import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  appendAgentLoopCoreChildNodeResponses,
  withAgentLoopCoreChildTotalPoints
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/nodeResponse/children';
import { createAgentLoopCoreCompressNodeResponse } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/nodeResponse/compress';

describe('createAgentLoopCoreCompressNodeResponse', () => {
  it('creates a shared compress node response with request ids and usage', () => {
    expect(
      createAgentLoopCoreCompressNodeResponse({
        moduleName: 'Compress',
        moduleType: FlowNodeTypeEnum.toolCall,
        usage: {
          moduleName: 'usage',
          model: 'GPT-4',
          inputTokens: 10,
          outputTokens: 3,
          totalPoints: 0.2
        },
        requestIds: ['', 'req_1'],
        seconds: 0.4,
        textOutput: 'compressed',
        includeCompressTextAgent: true
      })
    ).toEqual({
      id: 'req_1',
      nodeId: 'req_1',
      moduleName: 'Compress',
      moduleType: FlowNodeTypeEnum.toolCall,
      moduleLogo: 'core/app/agent/child/contextCompress',
      runningTime: 0.4,
      model: 'GPT-4',
      llmRequestIds: ['req_1'],
      inputTokens: 10,
      outputTokens: 3,
      totalPoints: 0.2,
      textOutput: 'compressed',
      compressTextAgent: {
        inputTokens: 10,
        outputTokens: 3,
        totalPoints: 0.2
      }
    });
  });

  it('keeps optional usage fields undefined when usage is missing', () => {
    const response = createAgentLoopCoreCompressNodeResponse({
      moduleName: 'Compress',
      moduleType: FlowNodeTypeEnum.agent,
      requestIds: ['req_empty'],
      seconds: 0.1
    });

    expect(response).toEqual(
      expect.objectContaining({
        id: 'req_empty',
        nodeId: 'req_empty',
        model: undefined,
        inputTokens: undefined,
        outputTokens: undefined,
        totalPoints: undefined
      })
    );
    expect(response).not.toHaveProperty('compressTextAgent');
  });
});

describe('agentLoopCore child node responses', () => {
  it('recomputes childTotalPoints from childrenResponses', () => {
    const response = withAgentLoopCoreChildTotalPoints({
      id: 'parent',
      nodeId: 'parent',
      moduleName: 'Parent',
      moduleType: FlowNodeTypeEnum.tool,
      childTotalPoints: 99,
      childrenResponses: [
        {
          id: 'child_1',
          nodeId: 'child_1',
          moduleName: 'Child 1',
          moduleType: FlowNodeTypeEnum.tool,
          totalPoints: 0.1
        },
        {
          id: 'child_2',
          nodeId: 'child_2',
          moduleName: 'Child 2',
          moduleType: FlowNodeTypeEnum.tool,
          totalPoints: 0.2
        }
      ]
    });

    expect(response.childTotalPoints).toBeCloseTo(0.3);
  });

  it('appends children and removes childTotalPoints when there is no child usage', () => {
    const response = appendAgentLoopCoreChildNodeResponses({
      nodeResponse: {
        id: 'parent',
        nodeId: 'parent',
        moduleName: 'Parent',
        moduleType: FlowNodeTypeEnum.tool,
        childTotalPoints: 3
      },
      childrenResponses: []
    });

    expect(response).not.toHaveProperty('childTotalPoints');

    expect(
      appendAgentLoopCoreChildNodeResponses({
        nodeResponse: response,
        childrenResponses: [
          {
            id: 'child',
            nodeId: 'child',
            moduleName: 'Child',
            moduleType: FlowNodeTypeEnum.tool,
            totalPoints: 0.5
          }
        ]
      })
    ).toEqual(
      expect.objectContaining({
        childTotalPoints: 0.5,
        childrenResponses: [
          expect.objectContaining({
            id: 'child'
          })
        ]
      })
    );
  });
});
