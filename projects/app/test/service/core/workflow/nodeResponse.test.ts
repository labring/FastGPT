import { describe, expect, it, vi } from 'vitest';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  ModerationActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  filterWorkflowFinalResponseData,
  createModerationFilteredWorkflowResponse,
  getWorkflowDatasetCiteRetention,
  getWorkflowFinalResponseError,
  shouldRetainWorkflowNodeResponses
} from '@/service/core/workflow/nodeResponse';

describe('completion moderation visibility', () => {
  const child: ChatHistoryItemResType = {
    id: 'child',
    nodeId: 'child',
    moduleName: 'Answer',
    moduleType: FlowNodeTypeEnum.answerNode,
    error: 'Content blocked',
    moderationRecords: [
      {
        stage: ModerationStageEnum.output,
        actionTaken: ModerationActionEnum.block,
        verdict: 'block',
        content: 'private audit text',
        keywords: ['private']
      }
    ]
  };
  const response: ChatHistoryItemResType = {
    ...child,
    id: 'parent',
    nodeId: 'parent',
    moduleType: FlowNodeTypeEnum.chatNode,
    childrenResponses: [child]
  };

  it.each([false, undefined])(
    'hides audit details without explicit write permission: %s',
    (permission) => {
      const result = filterWorkflowFinalResponseData({
        responseData: [response],
        responseAllData: true,
        canReadModerationRecords: permission
      });
      expect(result[0].error).toBe('Content blocked');
      expect(result[0].moderationRecords).toBeUndefined();
      expect(result[0].childrenResponses?.[0].moderationRecords).toBeUndefined();
      expect(response.moderationRecords).toBeDefined();
      expect(child.moderationRecords).toBeDefined();
    }
  );

  it('preserves audit details for writers requesting full responses', () => {
    expect(
      filterWorkflowFinalResponseData({
        responseData: [response],
        responseAllData: true,
        canReadModerationRecords: true
      })
    ).toEqual([response]);
  });

  it('keeps public field filtering even when the caller has write permission', () => {
    const result = filterWorkflowFinalResponseData({
      responseData: [{ ...response, moduleType: FlowNodeTypeEnum.toolCall }],
      responseAllData: false,
      canReadModerationRecords: true
    });
    expect(result[0].moderationRecords).toBeUndefined();
  });

  it.each([false, undefined, true])(
    'filters node SSE before writing without changing other events: %s',
    (permission) => {
      const responseWrite = vi.fn();
      const write = createModerationFilteredWorkflowResponse({
        responseWrite,
        canReadModerationRecords: permission
      });
      const event = workflowSseEvent.flowNodeResponse(response);
      write(event);
      const emitted = responseWrite.mock.calls[0][0];
      expect(emitted.data.error).toBe('Content blocked');
      expect(emitted.data.moderationRecords).toEqual(
        permission ? response.moderationRecords : undefined
      );
      expect(emitted.data.childrenResponses[0].moderationRecords).toEqual(
        permission ? child.moderationRecords : undefined
      );
      expect(response.moderationRecords).toBeDefined();
      const answer = workflowSseEvent.answerDelta('approved text');
      write(answer);
      expect(responseWrite).toHaveBeenLastCalledWith(answer);
    }
  );
});

describe('workflow dataset cite visibility', () => {
  it.each([
    {
      name: '关闭 Share 引用时内部保留、最终 JSON 隐藏引用标记',
      input: { requestedRetainDatasetCite: true, showCite: false, isShare: true },
      expectedWorkflowRetain: true,
      expectedJsonRetain: false
    },
    {
      name: 'Share 请求主动关闭引用时内部仍保留、最终 JSON 隐藏引用标记',
      input: { requestedRetainDatasetCite: false, showCite: true, isShare: true },
      expectedWorkflowRetain: true,
      expectedJsonRetain: false
    },
    {
      name: '请求和权限都开启时最终 JSON 保留引用标记',
      input: { requestedRetainDatasetCite: true, showCite: true, isShare: true },
      expectedWorkflowRetain: true,
      expectedJsonRetain: true
    },
    {
      name: '普通 API 请求关闭引用时保持原语义',
      input: { requestedRetainDatasetCite: false, showCite: true, isShare: false },
      expectedWorkflowRetain: false,
      expectedJsonRetain: false
    }
  ] as const)('$name', ({ input, expectedWorkflowRetain, expectedJsonRetain }) => {
    expect(getWorkflowDatasetCiteRetention(input)).toEqual({
      workflowRetainDatasetCite: expectedWorkflowRetain,
      jsonRetainDatasetCite: expectedJsonRetain
    });
  });
});

describe('shouldRetainWorkflowNodeResponses', () => {
  it.each([
    {
      name: 'V1 流式详情需要在结束时返回完整数组',
      input: { apiVersion: 'v1', stream: true, detail: true, isShare: false },
      expected: true
    },
    {
      name: 'V1 非详情且非 Share 不保留',
      input: { apiVersion: 'v1', stream: true, detail: false, isShare: false },
      expected: false
    },
    {
      name: 'V2 流式详情由客户端逐条拼接，不保留完整数组',
      input: { apiVersion: 'v2', stream: true, detail: true, isShare: false },
      expected: false
    },
    {
      name: 'V2 非流式详情需要返回 JSON 数组',
      input: { apiVersion: 'v2', stream: false, detail: true, isShare: false },
      expected: true
    },
    {
      name: 'V2 Share 为既有远程回调保留完整数组',
      input: { apiVersion: 'v2', stream: true, detail: true, isShare: true },
      expected: true
    }
  ] as const)('$name', ({ input, expected }) => {
    expect(shouldRetainWorkflowNodeResponses(input)).toBe(expected);
  });
});

describe('getWorkflowFinalResponseError', () => {
  it('returns workflowRuntimeSummary.errorText directly when present', () => {
    expect(
      getWorkflowFinalResponseError({
        workflowRuntimeSummary: {
          responseIds: [],
          finishedNodeIds: [],
          errorText: 'Root node failed',
          errorCount: 1,
          hasLoopRunBreak: false,
          hasToolStop: false,
          hasNestedEnd: false,
          citeCollectionIds: [],
          llmInputTokens: 0,
          llmOutputTokens: 0,
          totalPoints: 10
        },
        finalResponseData: [
          {
            id: 'node-1',
            moduleType: FlowNodeTypeEnum.chatNode,
            errorText: 'Different error'
          }
        ]
      })
    ).toBe('Root node failed');
  });

  it('delegates to findFailedResponseNode when summary has no errorText', () => {
    expect(
      getWorkflowFinalResponseError({
        finalResponseData: [
          {
            id: 'llm-node',
            moduleType: FlowNodeTypeEnum.chatNode,
            error: { message: 'OpenAI API key expired' }
          }
        ]
      })
    ).toEqual({ message: 'OpenAI API key expired' });
  });

  it('returns undefined when finalResponseData has no failure', () => {
    expect(
      getWorkflowFinalResponseError({
        finalResponseData: [
          {
            id: 'sandbox-tool-node',
            moduleType: FlowNodeTypeEnum.tool,
            errorText: 'Tool error: file not found'
          }
        ]
      })
    ).toBeUndefined();
  });
});
