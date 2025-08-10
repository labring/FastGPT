import { describe, expect, it } from 'vitest';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import {
  transformPreviewHistories,
  addStatisticalDataToHistoryItem
} from '@/global/core/chat/utils';

const mockResponseData = {
  id: '1',
  nodeId: '1',
  moduleName: 'test',
  moduleType: FlowNodeTypeEnum.chatNode
};

describe('transformPreviewHistories', () => {
  it('should transform histories correctly with responseDetail=true', () => {
    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }],
        responseData: [
          {
            ...mockResponseData,
            runningTime: 1.5
          }
        ]
      }
    ];

    const result = transformPreviewHistories(histories, true);

    expect(result[0]).toEqual({
      obj: ChatRoleEnum.AI,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }],
      responseData: undefined,
      llmModuleAccount: 1
    });
  });

  it('should transform histories correctly with responseDetail=false', () => {
    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }],
        responseData: [
          {
            ...mockResponseData,
            runningTime: 1.5
          }
        ]
      }
    ];

    const result = transformPreviewHistories(histories, false);

    expect(result[0]).toEqual({
      obj: ChatRoleEnum.AI,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }],
      responseData: undefined,
      llmModuleAccount: 1,
      totalQuoteList: undefined
    });
  });
});

describe('addStatisticalDataToHistoryItem', () => {
  it('should return original item if obj is not AI', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.Human,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }]
    };

    expect(addStatisticalDataToHistoryItem(item)).toStrictEqual(item);
  });

  it('should return original item if responseData is undefined', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }]
    };

    expect(addStatisticalDataToHistoryItem(item)).toStrictEqual(item);
  });

  it('should calculate statistics correctly', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }],
      responseData: [
        {
          ...mockResponseData,
          moduleType: FlowNodeTypeEnum.chatNode,
          runningTime: 1.5,
          historyPreview: [{ obj: ChatRoleEnum.AI, value: 'preview1' }]
        },
        {
          ...mockResponseData,
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          quoteList: [{ id: '1', q: 'test', a: 'answer' }],
          runningTime: 0.5
        },
        {
          ...mockResponseData,
          moduleType: FlowNodeTypeEnum.agent,
          runningTime: 1,
          toolDetail: [
            {
              moduleType: FlowNodeTypeEnum.chatNode,
              runningTime: 0.5
            }
          ]
        }
      ]
    };

    const result = addStatisticalDataToHistoryItem(item);

    expect(result).toEqual({
      ...item,
      llmModuleAccount: 3,
      totalQuoteList: [{ id: '1', q: 'test', a: 'answer' }],
      historyPreviewLength: 1
    });
  });

  it('should handle empty arrays and undefined values', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }],
      responseData: [
        {
          ...mockResponseData,
          runningTime: 0
        }
      ]
    };

    const result = addStatisticalDataToHistoryItem(item);

    expect(result).toEqual({
      ...item,
      llmModuleAccount: 1
    });
  });

  it('should handle nested plugin and loop details', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }],
      responseData: [
        {
          ...mockResponseData,
          runningTime: 1,
          pluginDetail: [
            {
              moduleType: FlowNodeTypeEnum.chatNode,
              runningTime: 0.5
            }
          ],
          loopDetail: [
            {
              moduleType: FlowNodeTypeEnum.agent,
              runningTime: 0.3
            }
          ]
        }
      ]
    };

    const result = addStatisticalDataToHistoryItem(item);

    expect(result).toEqual({
      ...item,
      llmModuleAccount: 3
    });
  });

  it('should handle external links', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'test response' } }],
      responseData: [
        {
          ...mockResponseData,
          toolRes: {
            referenceDocuments: [
              {
                name: 'doc1',
                webUrl: 'http://web.com',
                dingUrl: 'http://ding.com'
              },
              {
                webUrl: 'http://web2.com'
              }
            ]
          }
        }
      ]
    };

    const result = addStatisticalDataToHistoryItem(item);

    expect(result).toEqual({
      ...item,
      llmModuleAccount: 1,
      externalLinkList: [
        { name: '[Web] doc1', url: 'http://web.com' },
        { name: '[Dingding] doc1', url: 'http://ding.com' },
        { name: '[Web]', url: 'http://web2.com' }
      ]
    });
  });
});
