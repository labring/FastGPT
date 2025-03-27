import { describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { ChatHistoryItemResType, ChatItemType } from '@fastgpt/global/core/chat/type';
import {
  transformPreviewHistories,
  addStatisticalDataToHistoryItem
} from '@/global/core/chat/utils';

describe('transformPreviewHistories', () => {
  it('should transform histories correctly with responseDetail=true', () => {
    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: 'test response',
        responseData: [
          {
            moduleType: FlowNodeTypeEnum.chatNode,
            runningTime: 1.5
          }
        ]
      }
    ];

    const result = transformPreviewHistories(histories, true);

    expect(result[0]).toEqual({
      obj: ChatRoleEnum.AI,
      value: 'test response',
      responseData: undefined,
      llmModuleAccount: 1,
      totalQuoteList: [],
      totalRunningTime: 1.5,
      historyPreviewLength: undefined
    });
  });

  it('should transform histories correctly with responseDetail=false', () => {
    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: 'test response',
        responseData: [
          {
            moduleType: FlowNodeTypeEnum.chatNode,
            runningTime: 1.5
          }
        ]
      }
    ];

    const result = transformPreviewHistories(histories, false);

    expect(result[0]).toEqual({
      obj: ChatRoleEnum.AI,
      value: 'test response',
      responseData: undefined,
      llmModuleAccount: 1,
      totalQuoteList: undefined,
      totalRunningTime: 1.5,
      historyPreviewLength: undefined
    });
  });
});

describe('addStatisticalDataToHistoryItem', () => {
  it('should return original item if obj is not AI', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.Human,
      value: 'test'
    };

    expect(addStatisticalDataToHistoryItem(item)).toBe(item);
  });

  it('should return original item if totalQuoteList is already defined', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: 'test',
      totalQuoteList: []
    };

    expect(addStatisticalDataToHistoryItem(item)).toBe(item);
  });

  it('should return original item if responseData is undefined', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: 'test'
    };

    expect(addStatisticalDataToHistoryItem(item)).toBe(item);
  });

  it('should calculate statistics correctly', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: 'test',
      responseData: [
        {
          moduleType: FlowNodeTypeEnum.chatNode,
          runningTime: 1.5,
          historyPreview: ['preview1']
        },
        {
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          quoteList: [{ id: '1', q: 'test', a: 'answer' }],
          runningTime: 0.5
        },
        {
          moduleType: FlowNodeTypeEnum.tools,
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
      totalRunningTime: 3,
      historyPreviewLength: 1
    });
  });

  it('should handle empty arrays and undefined values', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: 'test',
      responseData: [
        {
          moduleType: FlowNodeTypeEnum.chatNode,
          runningTime: 0
        }
      ]
    };

    const result = addStatisticalDataToHistoryItem(item);

    expect(result).toEqual({
      ...item,
      llmModuleAccount: 1,
      totalQuoteList: [],
      totalRunningTime: 0,
      historyPreviewLength: undefined
    });
  });

  it('should handle nested plugin and loop details', () => {
    const item: ChatItemType = {
      obj: ChatRoleEnum.AI,
      value: 'test',
      responseData: [
        {
          moduleType: FlowNodeTypeEnum.chatNode,
          runningTime: 1,
          pluginDetail: [
            {
              moduleType: FlowNodeTypeEnum.chatNode,
              runningTime: 0.5
            }
          ],
          loopDetail: [
            {
              moduleType: FlowNodeTypeEnum.tools,
              runningTime: 0.3
            }
          ]
        }
      ]
    };

    const result = addStatisticalDataToHistoryItem(item);

    expect(result).toEqual({
      ...item,
      llmModuleAccount: 3,
      totalQuoteList: [],
      totalRunningTime: 1,
      historyPreviewLength: undefined
    });
  });
});
