import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  getWorkflowDatasetCiteRetention,
  getWorkflowFinalResponseError,
  shouldRetainWorkflowNodeResponses
} from '@/service/core/workflow/nodeResponse';

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
  it('returns nodeResponseSummary.lastError directly when present', () => {
    expect(
      getWorkflowFinalResponseError({
        nodeResponseSummary: {
          citeCollectionIds: [],
          errorCount: 1,
          lastError: 'Root node failed',
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

  it('ignores flat tool errors without parentId when summary has no lastError', () => {
    expect(
      getWorkflowFinalResponseError({
        finalResponseData: [
          {
            id: 'sandbox-tool-node',
            nodeId: 'sandbox-tool-node',
            moduleName: '虚拟机/列出目录',
            moduleType: FlowNodeTypeEnum.tool,
            toolInput: { path: '/user_files' },
            toolRes: 'Tool error: file not found. lstat /user_files: no such file or directory',
            errorText: 'Tool error: file not found. lstat /user_files: no such file or directory'
          }
        ]
      })
    ).toBeUndefined();
  });

  it('ignores subApp / custom tool execution errors carrying toolRes', () => {
    expect(
      getWorkflowFinalResponseError({
        finalResponseData: [
          {
            id: 'subapp-tool',
            moduleName: '子应用工具',
            moduleType: FlowNodeTypeEnum.appModule,
            toolInput: { query: 'test' },
            toolRes: 'Tool error: failed to execute',
            errorText: 'Tool error: failed to execute'
          }
        ]
      })
    ).toBeUndefined();
  });

  it('finds earlier root node error when the last node is a tool execution error', () => {
    expect(
      getWorkflowFinalResponseError({
        finalResponseData: [
          {
            id: 'llm-node',
            moduleType: FlowNodeTypeEnum.chatNode,
            errorText: 'Model rate limit exceeded'
          },
          {
            id: 'sandbox-tool-node',
            moduleType: FlowNodeTypeEnum.tool,
            errorText: 'Tool error: file not found'
          }
        ]
      })
    ).toBe('Model rate limit exceeded');
  });

  it('returns regular root node error when last node is not a tool', () => {
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

  it('returns undefined when finalResponseData is empty', () => {
    expect(
      getWorkflowFinalResponseError({
        finalResponseData: []
      })
    ).toBeUndefined();
  });
});
