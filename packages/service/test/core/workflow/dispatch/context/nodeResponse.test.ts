import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  createWorkflowEntryNodeResponseSink,
  createWorkflowNodeResponseActivity
} from '@fastgpt/service/core/workflow/dispatch/context/nodeResponse';
import { createWorkflowRuntimeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import {
  getWorkflowContext,
  runWithContext
} from '@fastgpt/service/core/workflow/dispatch/context';
import {
  createTestNodeResponseContext,
  createTestWorkflowFileContext,
  runWithTestWorkflowContext
} from './fixtures';

const createWriter = () => ({
  record: vi.fn(async (responses: ChatHistoryItemResType[]) => responses),
  close: vi.fn(),
  getFlatNodeResponses: vi.fn(() => [])
});

describe('WorkflowContext.getChildContext — 响应 Scope', () => {
  it('无运行上下文时拒绝派生，不执行回调', () => {
    const fn = vi.fn();
    expect(() =>
      runWithContext(getWorkflowContext().getChildContext({ nodeResponseSink: undefined }), fn)
    ).toThrow('Workflow context is unavailable');
    expect(fn).not.toHaveBeenCalled();
  });

  it('并行子流程各自持有响应 Scope，共享输出但不混合 summary 或 parentId', async () => {
    const writer = createWriter();
    const output = createWorkflowEntryNodeResponseSink({ writer: writer as any });
    const parentSummary = createWorkflowRuntimeSummary();
    const parentSink = createTestNodeResponseContext(output).getChildContext({
      workflowRuntimeSummary: parentSummary
    });
    const fileContext = await createTestWorkflowFileContext();
    const summaries = [createWorkflowRuntimeSummary(), createWorkflowRuntimeSummary()];

    await runWithTestWorkflowContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext,
        nodeResponseSink: parentSink
      },
      async (parentContext) => {
        await Promise.all(
          summaries.map((summary, index) => {
            const childSink = createTestNodeResponseContext(
              getWorkflowContext().nodeResponseSink
            ).getChildContext({
              workflowRuntimeSummary: summary,
              defaultParentId: `parent-${index}`
            });
            return runWithContext(
              getWorkflowContext().getChildContext({ nodeResponseSink: childSink }),
              async () => {
                await Promise.resolve();
                expect(getWorkflowContext()).not.toBe(parentContext);
                expect(getWorkflowContext().fileContext).toBe(fileContext);
                expect(getWorkflowContext().nodeResponseSink).toBe(childSink);
                await getWorkflowContext().nodeResponseSink!.publish([
                  {
                    response: {
                      id: `child-${index}`,
                      nodeId: `node-${index}`,
                      moduleType: FlowNodeTypeEnum.textEditor,
                      inputTokens: index + 1
                    } as ChatHistoryItemResType
                  }
                ]);
              }
            );
          })
        );
        expect(getWorkflowContext()).toBe(parentContext);
        expect(getWorkflowContext().nodeResponseSink).toBe(parentSink);
      }
    );

    expect(parentSummary.llmInputTokens).toBe(0);
    expect(summaries.map((summary) => summary.llmInputTokens)).toEqual([1, 2]);
    expect(writer.record).toHaveBeenCalledTimes(2);
    expect(writer.record.mock.calls.flatMap(([responses]) => responses)).toEqual([
      expect.objectContaining({ id: 'child-0', parentId: 'parent-0' }),
      expect.objectContaining({ id: 'child-1', parentId: 'parent-1' })
    ]);
  });

  it('子流程拒绝后恢复父 Scope，显式无输出只影响当前分支', async () => {
    const fileContext = await createTestWorkflowFileContext();
    const sink = createTestNodeResponseContext({ publish: vi.fn(async () => []) });
    await runWithTestWorkflowContext(
      { checkIsStopping: () => false, mcpClientMemory: {}, fileContext, nodeResponseSink: sink },
      async () => {
        await expect(
          runWithContext(
            getWorkflowContext().getChildContext({
              nodeResponseSink: createWorkflowEntryNodeResponseSink()
            }),
            async () => {
              await Promise.resolve();
              expect(getWorkflowContext().nodeResponseSink.hasOutput).toBe(false);
              throw new Error('child failed');
            }
          )
        ).rejects.toThrow('child failed');
        expect(getWorkflowContext().nodeResponseSink).toBe(sink);
      }
    );
  });
});

describe('WorkflowNodeResponseSink', () => {
  it('派生策略和 activity 视图共享当前 summary，新流程显式替换 summary，子 Scope 无关闭权限', async () => {
    const writer = createWriter();
    const entry = createWorkflowEntryNodeResponseSink({
      writer: writer as any,
      defaultParentId: 'parent'
    });
    const activity = createWorkflowNodeResponseActivity();
    const view = entry.getChildContext({ activity, record: false });
    expect(view.workflowRuntimeSummary).toBe(entry.workflowRuntimeSummary);
    const summary = createWorkflowRuntimeSummary();
    const child = view.getChildContext({ workflowRuntimeSummary: summary, record: true });
    expect(child.workflowRuntimeSummary).toBe(summary);
    expect(child).not.toHaveProperty('close');
    expect(child).not.toHaveProperty('getFlatNodeResponses');
    await child.publish([
      {
        response: {
          id: 'child',
          nodeId: 'node',
          moduleName: 'Node',
          moduleType: FlowNodeTypeEnum.textEditor,
          inputTokens: 3
        }
      }
    ]);
    expect(summary.llmInputTokens).toBe(3);
    expect(entry.workflowRuntimeSummary.llmInputTokens).toBe(0);
    expect(writer.record).not.toHaveBeenCalled();
    expect(activity.publishedResponseCount).toBe(1);
    expect(writer.close).not.toHaveBeenCalled();
  });

  it('parentId 和 activity 可显式清空，summary-only 入口关闭与详情读取均安全', async () => {
    const activity = createWorkflowNodeResponseActivity();
    const entry = createWorkflowEntryNodeResponseSink({ defaultParentId: 'parent', activity });
    const child = entry.getChildContext({ defaultParentId: undefined, activity: undefined });
    const response = {
      id: 'unparented',
      nodeId: 'node',
      moduleName: 'Node',
      moduleType: FlowNodeTypeEnum.textEditor
    };
    expect(await child.publish([{ response }])).toEqual([response]);
    expect(activity.publishedResponseCount).toBe(0);
    expect(child.workflowRuntimeSummary).toBe(entry.workflowRuntimeSummary);
    expect(entry.getFlatNodeResponses()).toEqual([]);
    await expect(entry.close()).resolves.toBeUndefined();
  });

  it('没有 output 时 Scope 仍统计响应，空发布不增加统计', async () => {
    const summary = createWorkflowRuntimeSummary();
    const sink = createWorkflowEntryNodeResponseSink({ workflowRuntimeSummary: summary });
    expect(sink.hasOutput).toBe(false);
    expect(await sink.publish([])).toEqual([]);
    const response = {
      id: 'summary-only',
      nodeId: 'node',
      moduleName: 'Node',
      moduleType: FlowNodeTypeEnum.textEditor,
      inputTokens: 3
    };
    expect(await sink.publish([{ response }])).toEqual([response]);
    expect(summary.llmInputTokens).toBe(3);
  });

  it('无 output 的策略保持无输出，最小 publish Adapter 可派生 activity 和隐藏策略', async () => {
    const activity = createWorkflowNodeResponseActivity();
    expect(createWorkflowEntryNodeResponseSink({ activity }).hasOutput).toBe(false);
    expect(createWorkflowEntryNodeResponseSink({ record: false }).hasOutput).toBe(false);
    const output = {
      publish: vi.fn(async (inputs: any[]) => inputs.map((input) => input.response))
    };
    const activeSink = createTestNodeResponseContext(output).getChildContext({ activity });
    const response = {
      id: 'activity',
      nodeId: 'node',
      moduleName: 'Node',
      moduleType: FlowNodeTypeEnum.textEditor
    };
    await activeSink!.publish([{ response }]);
    expect(activity.publishedResponseCount).toBe(1);
    expect(output.publish).toHaveBeenCalledTimes(1);

    const hiddenSink = createTestNodeResponseContext(output).getChildContext({
      record: false,
      emit: false
    });
    await hiddenSink!.publish([{ response }]);
    expect(hiddenSink!.hasOutput).toBe(false);
    expect(output.publish).toHaveBeenCalledTimes(1);
  });

  it('入口 Sink 的关闭和结果读取委托给 writer', async () => {
    const writer = createWriter();
    const sink = createWorkflowEntryNodeResponseSink({ writer: writer as any });
    expect(sink.getFlatNodeResponses()).toEqual([]);
    expect(writer.getFlatNodeResponses).toHaveBeenCalledTimes(1);
    await sink.close();
    expect(writer.close).toHaveBeenCalledTimes(1);
  });

  it('每个 workflow scope 独立统计，底层 sink 仍共享写入', async () => {
    const writer = createWriter();
    const rawSink = createWorkflowEntryNodeResponseSink({ writer: writer as any });
    const parentSummary = createWorkflowRuntimeSummary();
    const childSummary = createWorkflowRuntimeSummary();
    const parentSink = createTestNodeResponseContext(rawSink).getChildContext({
      workflowRuntimeSummary: parentSummary
    });
    const childSink = createTestNodeResponseContext(parentSink).getChildContext({
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
    const rawSink = createWorkflowEntryNodeResponseSink({
      writer: writer as any,
      apiVersion: 'v2',
      workflowStreamResponse
    });
    const parentSummary = createWorkflowRuntimeSummary();
    const childSummary = createWorkflowRuntimeSummary();
    const grandchildSummary = createWorkflowRuntimeSummary();
    const parentSink = createTestNodeResponseContext(rawSink).getChildContext({
      workflowRuntimeSummary: parentSummary
    });
    const hiddenParentSink = createTestNodeResponseContext(parentSink).getChildContext({
      record: false,
      emit: false
    });
    const childSink = createTestNodeResponseContext(hiddenParentSink).getChildContext({
      workflowRuntimeSummary: childSummary
    });
    const grandchildSink = createTestNodeResponseContext(childSink).getChildContext({
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
    const rawSink = createWorkflowEntryNodeResponseSink({ writer: writer as any });
    const childSink = createTestNodeResponseContext(rawSink).getChildContext({
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
    const workflowSink = createTestNodeResponseContext(
      createWorkflowEntryNodeResponseSink({ writer: writer as any })
    ).getChildContext({ workflowRuntimeSummary: createWorkflowRuntimeSummary() });
    const firstActivity = createWorkflowNodeResponseActivity();
    const secondActivity = createWorkflowNodeResponseActivity();
    const firstNodeSink = createTestNodeResponseContext(workflowSink).getChildContext({
      activity: firstActivity
    });
    const secondNodeSink = createTestNodeResponseContext(workflowSink).getChildContext({
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
    const sink = createWorkflowEntryNodeResponseSink({
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

  it('按 child id 和 parentId 共同去重，保留不同父节点下的同 id child', async () => {
    const writer = createWriter();
    const sink = createWorkflowEntryNodeResponseSink({ writer: writer as any });

    await sink.publish([
      {
        response: {
          id: 'shared-child',
          parentId: 'parent-1',
          nodeId: 'child-node',
          moduleType: FlowNodeTypeEnum.agent
        } as ChatHistoryItemResType
      }
    ]);

    await sink.publish([
      {
        response: {
          id: 'parent-2',
          nodeId: 'parent-node',
          moduleType: FlowNodeTypeEnum.agent,
          childrenResponses: [
            {
              id: 'shared-child',
              nodeId: 'child-node',
              moduleType: FlowNodeTypeEnum.agent
            }
          ]
        } as ChatHistoryItemResType
      }
    ]);

    await sink.publish([
      {
        response: {
          id: 'parent-1',
          nodeId: 'parent-node',
          moduleType: FlowNodeTypeEnum.agent,
          childrenResponses: [
            {
              id: 'shared-child',
              nodeId: 'child-node',
              moduleType: FlowNodeTypeEnum.agent
            }
          ]
        } as ChatHistoryItemResType
      }
    ]);

    expect(writer.record.mock.calls[1][0][0].childrenResponses).toEqual([
      expect.objectContaining({ id: 'shared-child', parentId: 'parent-2' })
    ]);
    expect(writer.record.mock.calls[2][0][0].childrenResponses).toBeUndefined();
  });

  it('工具失败 response 正常写入并发布，但不提升为 workflow 错误', async () => {
    const writer = createWriter();
    const workflowStreamResponse = vi.fn();
    const workflowRuntimeSummary = createWorkflowRuntimeSummary();
    const rawSink = createWorkflowEntryNodeResponseSink({
      writer: writer as any,
      apiVersion: 'v2',
      workflowStreamResponse
    });
    const sink = createTestNodeResponseContext(rawSink).getChildContext({ workflowRuntimeSummary });
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
    const sink = createWorkflowEntryNodeResponseSink({
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
    const sink = createWorkflowEntryNodeResponseSink({
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
          quoteList: [
            {
              id: 'quote',
              datasetId: 'dataset',
              collectionId: 'collection',
              sourceName: 'source',
              chunkIndex: 0,
              score: []
            }
          ],
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
