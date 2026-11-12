import {
  runWithTestWorkflowContext,
  createTestWorkflowFileContext
} from '@fastgpt/service/test/core/workflow/dispatch/context/fixtures';
import {
  getWorkflowContext,
  runWithContext
} from '@fastgpt/service/core/workflow/dispatch/context';
import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  createWorkflowEntryNodeResponseSink,
  createWorkflowNodeResponseActivity
} from '@fastgpt/service/core/workflow/dispatch/context/nodeResponse';
import { createWorkflowRuntimeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';

const createWriter = () => ({
  record: vi.fn(async (responses: ChatHistoryItemResType[]) => responses),
  close: vi.fn(),
  getFlatNodeResponses: vi.fn(() => [])
});

describe('createWorkflowEntryNodeResponseSink', () => {
  it.each([
    { scopeEmit: true, itemEmit: true, channel: true, record: true, sends: 1 },
    { scopeEmit: false, itemEmit: true, channel: true, record: true, sends: 0 },
    { scopeEmit: true, itemEmit: false, channel: true, record: true, sends: 0 },
    { scopeEmit: true, itemEmit: true, channel: false, record: true, sends: 0 },
    { scopeEmit: true, itemEmit: true, channel: true, record: false, sends: 1 },
    {
      apiVersion: 'v1' as const,
      scopeEmit: true,
      itemEmit: true,
      channel: true,
      record: true,
      sends: 0
    }
  ])(
    '协议版本、emit 和当前 writer 联合控制 SSE，record 独立控制保存：%j',
    async ({ apiVersion = 'v2' as const, scopeEmit, itemEmit, channel, record, sends }) => {
      const writer = createWriter();
      const send = vi.fn();
      const sink = createWorkflowEntryNodeResponseSink({
        writer: writer as any,
        apiVersion
      }).getChildContext({ emit: scopeEmit });
      await runWithTestWorkflowContext(
        {
          fileContext: await createTestWorkflowFileContext(),
          mcpClientMemory: {},
          checkIsStopping: () => false,
          workflowStreamResponse: channel ? send : undefined,
          nodeResponseSink: sink
        },
        () =>
          sink.publish([
            {
              response: {
                id: 'result',
                nodeId: 'node',
                moduleName: 'Node',
                moduleType: FlowNodeTypeEnum.textEditor,
                inputTokens: 7
              },
              emit: itemEmit,
              record
            }
          ])
      );
      expect(send).toHaveBeenCalledTimes(sends);
      expect(writer.record).toHaveBeenCalledTimes(record ? 1 : 0);
      expect(sink.workflowRuntimeSummary.llmInputTokens).toBe(7);
    }
  );

  it('并发子作用域独立统计和选择通道，显式禁流不回退父级', async () => {
    const writer = createWriter();
    const releases = new Map<string, () => void>();
    writer.record.mockImplementation(
      (responses) =>
        new Promise((resolve) => {
          releases.set(responses[0].id!, () => resolve(responses));
        })
    );
    const rootWriter = vi.fn();
    const siblingWriter = vi.fn();
    const rootSink = createWorkflowEntryNodeResponseSink({
      writer: writer as any,
      apiVersion: 'v2'
    });
    await runWithTestWorkflowContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        mcpClientMemory: {},
        checkIsStopping: () => false,
        workflowStreamResponse: rootWriter,
        nodeResponseSink: rootSink
      },
      async (parent) => {
        const activities = [
          createWorkflowNodeResponseActivity(),
          createWorkflowNodeResponseActivity()
        ];
        const children = [undefined, siblingWriter].map((workflowStreamResponse, index) =>
          parent.getChildContext({
            workflowStreamResponse,
            nodeResponseSink: rootSink.getChildContext({
              workflowRuntimeSummary: createWorkflowRuntimeSummary(),
              activity: activities[index]
            })
          })
        );
        const tasks = children.map((child, index) =>
          runWithContext(child, () =>
            child.nodeResponseSink.publish([
              {
                response: {
                  id: String(index),
                  nodeId: String(index),
                  moduleName: 'Node',
                  moduleType: FlowNodeTypeEnum.textEditor,
                  inputTokens: index + 1
                }
              }
            ])
          )
        );
        releases.get('1')!();
        await tasks[1];
        expect(activities.map((activity) => activity.publishedResponseCount)).toEqual([0, 1]);
        releases.get('0')!();
        await tasks[0];
        expect(activities.map((activity) => activity.publishedResponseCount)).toEqual([1, 1]);
        expect(getWorkflowContext()).toBe(parent);
        expect(rootWriter).not.toHaveBeenCalled();
        expect(siblingWriter).toHaveBeenCalledOnce();
        expect(siblingWriter.mock.calls[0][0].data.id).toBe('1');
        expect(
          children.map((child) => child.nodeResponseSink.workflowRuntimeSummary.llmInputTokens)
        ).toEqual([1, 2]);
        expect(rootSink.workflowRuntimeSummary.llmInputTokens).toBe(0);
      }
    );
    expect(writer.record).toHaveBeenCalledTimes(2);
  });

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

    // Child 无权关闭共享 writer，只有入口可以读取结果并执行收尾。
    expect(entry.getFlatNodeResponses()).toEqual([]);
    expect(writer.getFlatNodeResponses).toHaveBeenCalledOnce();
    await entry.close();
    expect(writer.close).toHaveBeenCalledOnce();
  });

  it('summary-only 清空 parentId/activity 后仍统计响应，空发布和收尾安全', async () => {
    const activity = createWorkflowNodeResponseActivity();
    const entry = createWorkflowEntryNodeResponseSink({ defaultParentId: 'parent', activity });
    const child = entry.getChildContext({ defaultParentId: undefined, activity: undefined });
    const response = {
      id: 'unparented',
      nodeId: 'node',
      moduleName: 'Node',
      moduleType: FlowNodeTypeEnum.textEditor,
      inputTokens: 3
    };
    expect(entry.hasOutput).toBe(false);
    expect(child.hasOutput).toBe(false);
    expect(await child.publish([])).toEqual([]);
    expect(entry.workflowRuntimeSummary.llmInputTokens).toBe(0);
    expect(await child.publish([{ response }])).toEqual([response]);
    expect(activity.publishedResponseCount).toBe(0);
    expect(child.workflowRuntimeSummary).toBe(entry.workflowRuntimeSummary);
    expect(entry.workflowRuntimeSummary.llmInputTokens).toBe(3);
    expect(entry.getFlatNodeResponses()).toEqual([]);
    await expect(entry.close()).resolves.toBeUndefined();
  });

  it('无 output 的策略保持无输出，最小 publish Adapter 可派生 activity 和隐藏策略', async () => {
    const activity = createWorkflowNodeResponseActivity();
    expect(createWorkflowEntryNodeResponseSink({ activity }).hasOutput).toBe(false);
    expect(createWorkflowEntryNodeResponseSink({ record: false }).hasOutput).toBe(false);
    const output = {
      publish: vi.fn(async (inputs: any[]) => inputs.map((input) => input.response))
    };
    const activeSink = createWorkflowEntryNodeResponseSink({ output }).getChildContext({
      activity
    });
    const response = {
      id: 'activity',
      nodeId: 'node',
      moduleName: 'Node',
      moduleType: FlowNodeTypeEnum.textEditor
    };
    await activeSink.publish([{ response }]);
    expect(activity.publishedResponseCount).toBe(1);
    expect(output.publish).toHaveBeenCalledTimes(1);

    const hiddenSink = createWorkflowEntryNodeResponseSink({ output }).getChildContext({
      record: false,
      emit: false
    });
    await hiddenSink.publish([{ response }]);
    expect(hiddenSink.hasOutput).toBe(false);
    expect(output.publish).toHaveBeenCalledTimes(1);
  });

  it('隐藏策略跨多层 child scope 继承，child summary 仍独立更新', async () => {
    const writer = createWriter();
    const workflowStreamResponse = vi.fn();
    return runWithTestWorkflowContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: await createTestWorkflowFileContext(),
        workflowStreamResponse
      },
      async () => {
        const rawSink = createWorkflowEntryNodeResponseSink({
          writer: writer as any,
          apiVersion: 'v2'
        });
        const parentSummary = createWorkflowRuntimeSummary();
        const childSummary = createWorkflowRuntimeSummary();
        const grandchildSummary = createWorkflowRuntimeSummary();
        const parentSink = rawSink.getChildContext({
          workflowRuntimeSummary: parentSummary
        });
        const hiddenParentSink = parentSink.getChildContext({
          record: false,
          emit: false
        });
        const childSink = hiddenParentSink.getChildContext({
          workflowRuntimeSummary: childSummary
        });
        const grandchildSink = childSink.getChildContext({
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
      }
    );
  });

  it('child workflow scope 给缺少 parentId 的 response 补默认父级', async () => {
    const writer = createWriter();
    const rawSink = createWorkflowEntryNodeResponseSink({ writer: writer as any });
    const childSink = rawSink.getChildContext({
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

  it('V2 按输入顺序逐条发布，并允许父响应只入库不发布', async () => {
    const writer = createWriter();
    const workflowStreamResponse = vi.fn();
    return runWithTestWorkflowContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: await createTestWorkflowFileContext(),
        workflowStreamResponse
      },
      async () => {
        const sink = createWorkflowEntryNodeResponseSink({
          writer: writer as any,
          apiVersion: 'v2',
          responseAllData: true,
          responseDetail: true
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
      }
    );
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
    return runWithTestWorkflowContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: await createTestWorkflowFileContext(),
        workflowStreamResponse
      },
      async () => {
        const workflowRuntimeSummary = createWorkflowRuntimeSummary();
        const rawSink = createWorkflowEntryNodeResponseSink({
          writer: writer as any,
          apiVersion: 'v2'
        });
        const sink = rawSink.getChildContext({ workflowRuntimeSummary });
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
      }
    );
  });

  it('Share 模式保留 id/parentId，但按详情配置过滤引用和私有字段', async () => {
    const writer = createWriter();
    const workflowStreamResponse = vi.fn();
    return runWithTestWorkflowContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: await createTestWorkflowFileContext(),
        workflowStreamResponse
      },
      async () => {
        const sink = createWorkflowEntryNodeResponseSink({
          writer: writer as any,
          apiVersion: 'v2',
          responseAllData: false,
          responseDetail: false
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
      }
    );
  });
});
