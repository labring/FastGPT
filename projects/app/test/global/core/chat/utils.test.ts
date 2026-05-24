import { describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { SANDBOX_READ_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';

describe('addStatisticalDataToHistoryItem', () => {
  it('marks sandbox usage when a nested response calls any sandbox tool', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'agent-response',
          nodeId: 'agent-node',
          moduleName: 'Agent',
          moduleType: FlowNodeTypeEnum.agent,
          childrenResponses: [
            {
              id: 'sandbox-response',
              nodeId: 'sandbox-node',
              moduleName: 'Read file',
              moduleType: FlowNodeTypeEnum.tool,
              toolId: SANDBOX_READ_FILE_TOOL_NAME
            }
          ]
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).useAgentSandbox).toBe(true);
  });

  it('does not mark non-sandbox tools as sandbox usage', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'tool-response',
          nodeId: 'tool-node',
          moduleName: 'HTTP tool',
          moduleType: FlowNodeTypeEnum.tool,
          toolId: 'http-tool'
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).useAgentSandbox).toBe(false);
  });

  it('does not treat object prototype fields as sandbox tool ids', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'tool-response',
          nodeId: 'tool-node',
          moduleName: 'Unexpected tool',
          moduleType: FlowNodeTypeEnum.tool,
          toolId: 'toString'
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).useAgentSandbox).toBe(false);
  });

  it('includes dataset quote tags that use QUOTE markdown links', () => {
    const quoteId = '507f1f77bcf86cd799439011';
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: `done [${quoteId}](QUOTE)`
          }
        }
      ],
      responseData: [
        {
          id: 'dataset-response',
          nodeId: 'dataset-node',
          moduleName: 'Dataset Search',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          quoteList: [
            {
              id: quoteId,
              chunkIndex: 0,
              datasetId: 'dataset-1',
              collectionId: 'collection-1',
              sourceName: 'doc.pdf',
              score: [{ type: 'embedding', value: 0.9, index: 0 }]
            }
          ]
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).totalQuoteList).toHaveLength(1);
  });
});
