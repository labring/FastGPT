import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  bindWorkflowNodeResponseActivity,
  createWorkflowNodeResponseActivity,
  createWorkflowNodeResponseScope,
  withWorkflowNodeResponseOutputPolicy,
  WorkflowNodeResponseSink
} from '@fastgpt/service/core/workflow/dispatch/nodeResponseSink';
import { createWorkflowRuntimeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';

const createWriter = () => ({
  record: vi.fn(async (responses: ChatHistoryItemResType[]) => responses),
  close: vi.fn()
});

describe('WorkflowNodeResponseSink', () => {
  it('每个 workflow scope 独立统计，底层 sink 仍共享写入', async () => {
    const writer = createWriter();
    const rawSink = new WorkflowNodeResponseSink({ writer: writer as any });
    const parentSummary = createWorkflowRuntimeSummary();
    const childSummary = createWorkflowRuntimeSummary();
    const parentSink = createWorkflowNodeResponseScope({
      sink: rawSink,
      workflowRuntimeSummary: parentSummary
    });
    const childSink = createWorkflowNodeResponseScope({
      sink: parentSink,
      workflowRuntimeSummary: childSummary
    });

    await parentSink.publish([
      {
        response: {
          id: 'parent',
          nodeId: 'parent-node',
          moduleType: FlowNodeTypeEnum.textEditor,
          inputTokens: 2,
          outputTokens: 1
        } as any
      }
    ]);
    await childSink.publish([
      {
        response: {
          id: 'child',
          nodeId: 'child-node',
          moduleType: FlowNodeTypeEnum.textEditor,
          inputTokens: 5,
          outputTokens: 3
        } as any
      }
    ]);

    expect(writer.record).toHaveBeenCalledTimes(2);
    expect(parentSummary).toMatchObject({ llmInputTokens: 2, llmOutputTokens: 1 });
    expect(childSummary).toMatchObject({ llmInputTokens: 5, llmOutputTokens: 3 });
  });

  it('隐藏策略跨多层 child scope 继承，child summary 仍独立更新', async () => {
    const writer = createWriter();
    const workflowStreamResponse = vi.fn();
    const rawSink = new WorkflowNodeResponseSink({
      writer: writer as any,
      apiVersion: 'v2',
      workflowStreamResponse
    });
    const parentSummary = createWorkflowRuntimeSummary();
    const childSummary = createWorkflowRuntimeSummary();
    const grandchildSummary = createWorkflowRuntimeSummary();
    const parentSink = createWorkflowNodeResponseScope({
      sink: rawSink,
      workflowRuntimeSummary: parentSummary
    });
    const hiddenParentSink = withWorkflowNodeResponseOutputPolicy({
      sink: parentSink,
      record: false,
      emit: false
    });
    const childSink = createWorkflowNodeResponseScope({
      sink: hiddenParentSink,
      workflowRuntimeSummary: childSummary
    });
    const grandchildSink = createWorkflowNodeResponseScope({
      sink: childSink,
      workflowRuntimeSummary: grandchildSummary,
      record: true,
      emit: true
    });

    expect(hiddenParentSink?.hasOutput).toBe(false);
    expect(childSink.hasOutput).toBe(false);
    expect(grandchildSink.hasOutput).toBe(false);

    await grandchildSink.publish([
      {
        response: {
          id: 'hidden-child',
          nodeId: 'child-node',
          moduleType: FlowNodeTypeEnum.textEditor,
          inputTokens: 7,
          outputTokens: 4
        } as any
      }
    ]);

    expect(writer.record).not.toHaveBeenCalled();
    expect(workflowStreamResponse).not.toHaveBeenCalled();
    expect(parentSummary.llmInputTokens).toBe(0);
    expect(childSummary.llmInputTokens).toBe(0);
    expect(grandchildSummary).toMatchObject({ llmInputTokens: 7, llmOutputTokens: 4 });
  });

  it('child workflow scope 给缺少 parentId 的 response 补默认父级', async () => {
    const writer = createWriter();
    const rawSink = new WorkflowNodeResponseSink({ writer: writer as any });
    const childSink = createWorkflowNodeResponseScope({
      sink: rawSink,
      workflowRuntimeSummary: createWorkflowRuntimeSummary(),
      defaultParentId: 'tool-response'
    });

    await childSink.publish([
      {
        response: {
          id: 'agent-response',
          nodeId: 'agent-node',
          moduleType: FlowNodeTypeEnum.agent
        } as ChatHistoryItemResType
      },
      {
        response: {
          id: 'tool-response-detail',
          parentId: 'agent-response',
          nodeId: 'tool-node',
          moduleType: FlowNodeTypeEnum.tool
        } as ChatHistoryItemResType
      }
    ]);

    expect(writer.record).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'agent-response', parentId: 'tool-response' }),
      expect.objectContaining({ id: 'tool-response-detail', parentId: 'agent-response' })
    ]);
  });

  it('并行节点使用独立 activity，其他节点发布不会改变当前节点归属', async () => {
    const writer = createWriter();
    const workflowSink = createWorkflowNodeResponseScope({
      sink: new WorkflowNodeResponseSink({ writer: writer as any }),
      workflowRuntimeSummary: createWorkflowRuntimeSummary()
    });
    const firstActivity = createWorkflowNodeResponseActivity();
    const secondActivity = createWorkflowNodeResponseActivity();
    const firstNodeSink = bindWorkflowNodeResponseActivity({
      sink: workflowSink,
      activity: firstActivity
    });
    const secondNodeSink = bindWorkflowNodeResponseActivity({
      sink: workflowSink,
      activity: secondActivity
    });

    await Promise.all([
      firstNodeSink?.publish([
        {
          response: {
            id: 'first-node-response',
            nodeId: 'first-node',
            moduleType: FlowNodeTypeEnum.textEditor
          } as ChatHistoryItemResType
        }
      ]),
      secondNodeSink?.publish([
        {
          response: {
            id: 'second-node-response',
            nodeId: 'second-node',
            moduleType: FlowNodeTypeEnum.textEditor
          } as ChatHistoryItemResType
        }
      ])
    ]);

    expect(firstActivity.publishedResponseCount).toBe(1);
    expect(secondActivity.publishedResponseCount).toBe(1);
  });

  it('V2 按输入顺序逐条发布，并允许父响应只入库不发布', async () => {
    const writer = createWriter();
    const workflowStreamResponse = vi.fn();
    const sink = new WorkflowNodeResponseSink({
      writer: writer as any,
      apiVersion: 'v2',
      responseAllData: true,
      responseDetail: true,
      workflowStreamResponse
    });
    const child = {
      id: 'child',
      nodeId: 'child-node',
      moduleName: 'Child',
      moduleType: FlowNodeTypeEnum.agent
    };
    const parent = {
      id: 'parent',
      nodeId: 'parent-node',
      moduleName: 'Parent',
      moduleType: FlowNodeTypeEnum.agent
    };

    await sink.publish([
      { response: child, parentId: 'parent' },
      { response: parent, emit: false }
    ]);

    expect(writer.record).toHaveBeenCalledWith([{ ...child, parentId: 'parent' }, parent]);
    expect(workflowStreamResponse).toHaveBeenCalledTimes(1);
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      event: SseResponseEventEnum.flowNodeResponse,
      data: { ...child, parentId: 'parent' }
    });
  });

  it('工具失败 response 正常写入并发布，但不提升为 workflow 错误', async () => {
    const writer = createWriter();
    const workflowStreamResponse = vi.fn();
    const workflowRuntimeSummary = createWorkflowRuntimeSummary();
    const rawSink = new WorkflowNodeResponseSink({
      writer: writer as any,
      apiVersion: 'v2',
      workflowStreamResponse
    });
    const sink = createWorkflowNodeResponseScope({
      sink: rawSink,
      workflowRuntimeSummary
    });
    const response = {
      id: 'failed-response',
      nodeId: 'failed-node',
      moduleName: 'Failed node',
      moduleType: FlowNodeTypeEnum.tool,
      inputTokens: 11,
      outputTokens: 4,
      error: 'tool failed'
    } as ChatHistoryItemResType;

    await sink.publish([{ response }]);

    expect(workflowRuntimeSummary).toMatchObject({
      hasError: false,
      errorCount: 0,
      llmInputTokens: 11,
      llmOutputTokens: 4
    });
    expect(workflowRuntimeSummary.errorText).toBeUndefined();
    expect(writer.record).toHaveBeenCalledWith([response]);
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      event: SseResponseEventEnum.flowNodeResponse,
      data: response
    });
  });

  it('V1 只写入，不发布逐条 flowNodeResponse', async () => {
    const writer = createWriter();
    const workflowStreamResponse = vi.fn();
    const sink = new WorkflowNodeResponseSink({
      writer: writer as any,
      apiVersion: 'v1',
      workflowStreamResponse
    });

    await sink.publish([
      {
        response: {
          id: 'node',
          nodeId: 'node',
          moduleName: 'Node',
          moduleType: FlowNodeTypeEnum.agent
        }
      }
    ]);

    expect(writer.record).toHaveBeenCalledTimes(1);
    expect(workflowStreamResponse).not.toHaveBeenCalled();
  });

  it('Share 模式保留 id/parentId，但按详情配置过滤引用和私有字段', async () => {
    const writer = createWriter();
    const workflowStreamResponse = vi.fn();
    const sink = new WorkflowNodeResponseSink({
      writer: writer as any,
      apiVersion: 'v2',
      responseAllData: false,
      responseDetail: false,
      workflowStreamResponse
    });

    await sink.publish([
      {
        response: {
          id: 'dataset-search',
          parentId: 'agent',
          nodeId: 'dataset-node',
          moduleName: 'Dataset Search',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          runningTime: 1,
          quoteList: [{ id: 'quote' }],
          toolInput: { secret: true }
        } as ChatHistoryItemResType
      }
    ]);

    expect(writer.record.mock.calls[0][0][0]).toMatchObject({
      quoteList: [{ id: 'quote' }],
      toolInput: { secret: true }
    });
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      event: SseResponseEventEnum.flowNodeResponse,
      data: {
        id: 'dataset-search',
        parentId: 'agent',
        nodeId: 'dataset-node',
        moduleName: 'Dataset Search',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        runningTime: 1
      }
    });
  });
});
