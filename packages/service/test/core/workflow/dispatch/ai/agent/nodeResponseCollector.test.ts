import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { createAgentNodeResponseCollector } from '@fastgpt/service/core/workflow/dispatch/ai/agent/nodeResponseCollector';
import { createWorkflowEntryNodeResponseSink } from '@fastgpt/service/core/workflow/dispatch/context/nodeResponse';

const makeResponse = (id: string): ChatHistoryItemResType => ({
  id,
  nodeId: id,
  moduleName: id,
  moduleType: FlowNodeTypeEnum.agent
});

describe('createAgentNodeResponseCollector', () => {
  it('逐条串行发布详情，并维护本 Agent 的响应摘要', async () => {
    const publishOrder: string[] = [];
    const output = {
      publish: vi.fn(async ([{ response }]: Array<{ response: ChatHistoryItemResType }>) => {
        publishOrder.push(response.id!);
        return [response];
      })
    };
    const nodeResponseSink = createWorkflowEntryNodeResponseSink({ output });
    const collector = createAgentNodeResponseCollector({ nodeResponseSink });

    collector.appendNodeResponse(makeResponse('first'));
    collector.appendNodeResponse(makeResponse('second'));
    await collector.flush();

    expect(publishOrder).toEqual(['first', 'second']);
    expect(collector.getWorkflowRuntimeSummary().responseIds).toEqual(['first', 'second']);
  });

  it('存在 nodeResponseParentId 时为未携带 parentId 的步骤补齐父节点，并保留已有深层 parentId', async () => {
    const publishedEntries: Array<{ response: ChatHistoryItemResType; parentId?: string }> = [];
    const nodeResponseSink = {
      publish: vi.fn(
        async (entries: Array<{ response: ChatHistoryItemResType; parentId?: string }>) => {
          publishedEntries.push(...entries);
          return entries.map((entry) => entry.response);
        }
      )
    } as unknown as Parameters<typeof createAgentNodeResponseCollector>[0]['nodeResponseSink'];
    const collector = createAgentNodeResponseCollector({
      nodeResponseSink,
      nodeResponseParentId: 'agent_root_id'
    });

    collector.appendNodeResponse(makeResponse('step_1'));
    collector.appendNodeResponse({
      ...makeResponse('tool_compress_1'),
      parentId: 'tool_call_1'
    });
    await collector.flush();

    expect(publishedEntries).toEqual([
      {
        response: makeResponse('step_1'),
        parentId: 'agent_root_id'
      },
      {
        response: {
          ...makeResponse('tool_compress_1'),
          parentId: 'tool_call_1'
        },
        parentId: 'tool_call_1'
      }
    ]);
  });
});
