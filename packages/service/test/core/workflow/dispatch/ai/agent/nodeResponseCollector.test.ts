import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { createAgentNodeResponseCollector } from '@fastgpt/service/core/workflow/dispatch/ai/agent/nodeResponseCollector';

const makeResponse = (id: string): ChatHistoryItemResType => ({
  id,
  nodeId: id,
  moduleName: id,
  moduleType: FlowNodeTypeEnum.agent
});

describe('createAgentNodeResponseCollector', () => {
  it('存在 sink 时逐条串行发布，不在 Agent 内保留完整数组', async () => {
    const publishOrder: string[] = [];
    const nodeResponseSink = {
      publish: vi.fn(async ([{ response }]: Array<{ response: ChatHistoryItemResType }>) => {
        publishOrder.push(response.id!);
        return [response];
      })
    };
    const nodeResponses: ChatHistoryItemResType[] = [];
    const collector = createAgentNodeResponseCollector({ nodeResponseSink, nodeResponses });

    collector.appendNodeResponse(makeResponse('first'));
    collector.appendNodeResponse(makeResponse('second'));
    await collector.flush();

    expect(publishOrder).toEqual(['first', 'second']);
    expect(nodeResponses).toEqual([]);
    expect(collector.getNodeResponses()).toBeUndefined();
    expect(collector.getRuntimeNodeResponseSummary()?.responseIds).toEqual(['first', 'second']);
  });

  it('没有 sink 时兼容调试路径，返回本地数组', () => {
    const nodeResponses: ChatHistoryItemResType[] = [];
    const collector = createAgentNodeResponseCollector({ nodeResponses });

    collector.appendNodeResponse(makeResponse('local'));

    expect(collector.getNodeResponses()).toEqual([makeResponse('local')]);
    expect(collector.getRuntimeNodeResponseSummary()).toBeUndefined();
  });
});
