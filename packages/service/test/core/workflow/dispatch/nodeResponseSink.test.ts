import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { WorkflowNodeResponseSink } from '@fastgpt/service/core/workflow/dispatch/nodeResponseSink';

const createWriter = () => ({
  record: vi.fn(async (responses: ChatHistoryItemResType[]) => responses),
  close: vi.fn(),
  getSummary: vi.fn(() => ({
    errorCount: 0,
    citeCollectionIds: [],
    totalPoints: 0
  })),
  getFlatNodeResponses: vi.fn(() => [])
});

describe('WorkflowNodeResponseSink', () => {
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
