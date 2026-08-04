import { describe, expect, it, vi } from 'vitest';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  WorkflowBuilderAppliedSchema,
  WorkflowBuilderChatBodySchema
} from '@fastgpt/global/openapi/core/workflow/builder/api';
import { WorkflowDocumentSchema, getWorkflowChecksum } from '@fastgpt/workflow-core/src/index';
import fixture from '@fastgpt/workflow-core/test/fixtures/basic-static/workflow.json';
import { buildStreamFetchBody, handleEventSourceData } from '@/web/common/api/fetch';
import { clearWorkflowBuilderChatHistory } from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/api';
import { mergeWorkflowBuilderAppliedAppDetail } from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/utils';
import {
  matchesWorkflowAutoLayoutRequest,
  mergeWorkflowLayoutNodes
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflowAutoLayout';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Node } from 'reactflow';

const mocks = vi.hoisted(() => ({
  batchDeleteChatHistories: vi.fn()
}));

vi.mock('@/web/core/chat/history/api', () => ({
  batchDeleteChatHistories: mocks.batchDeleteChatHistories
}));

describe('Workflow Builder Web Adapter', () => {
  it('binds auto-layout readiness to the exact Builder-applied node set', () => {
    const nodes = [{ id: 'start' }, { id: 'answer' }] as Parameters<
      typeof matchesWorkflowAutoLayoutRequest
    >[0]['nodes'];

    expect(
      matchesWorkflowAutoLayoutRequest({
        nodes,
        nodeIds: new Set(['start', 'answer'])
      })
    ).toBe(true);
    expect(
      matchesWorkflowAutoLayoutRequest({
        nodes,
        nodeIds: new Set(['start', 'old-node'])
      })
    ).toBe(false);
  });

  it('merges auto-layout positions without overwriting newer node business data', () => {
    const createNode = ({
      name,
      prompt,
      position
    }: {
      name: string;
      prompt: string;
      position: { x: number; y: number };
    }) =>
      ({
        id: 'ai-node',
        position,
        data: {
          nodeId: 'ai-node',
          name,
          inputs: [{ key: 'systemPrompt', value: prompt }]
        }
      }) as Node<FlowNodeItemType>;

    const importedNode = createNode({
      name: 'Updated AI node',
      prompt: 'Use the confirmed workflow requirements',
      position: { x: 0, y: 0 }
    });
    const staleLayoutNode = createNode({
      name: 'Old AI node',
      prompt: 'Old prompt',
      position: { x: 320, y: 160 }
    });

    const [result] = mergeWorkflowLayoutNodes({
      currentNodes: [importedNode],
      layoutedNodes: [staleLayoutNode],
      resizedNodeIds: new Set()
    });

    expect(result.position).toEqual({ x: 320, y: 160 });
    expect(result.data).toBe(importedNode.data);
    expect(result.data.name).toBe('Updated AI node');
    expect(result.data.inputs[0]?.value).toBe('Use the confirmed workflow requirements');
  });

  it('clears only the current Builder history before restarting the local chat', async () => {
    mocks.batchDeleteChatHistories.mockResolvedValueOnce(undefined);
    const clearChatRecords = vi.fn();
    const restartChat = vi.fn();

    await clearWorkflowBuilderChatHistory({
      appId: 'app-1',
      chatId: 'builder-chat-1',
      clearChatRecords,
      restartChat
    });

    expect(mocks.batchDeleteChatHistories).toHaveBeenCalledWith({
      appId: 'app-1',
      sourceType: 'app',
      chatIds: ['builder-chat-1']
    });
    expect(clearChatRecords).toHaveBeenCalledTimes(1);
    expect(restartChat).toHaveBeenCalledTimes(1);
  });

  it('keeps local Builder history when server deletion fails', async () => {
    mocks.batchDeleteChatHistories.mockRejectedValueOnce(new Error('delete failed'));
    const clearChatRecords = vi.fn();
    const restartChat = vi.fn();

    await expect(
      clearWorkflowBuilderChatHistory({
        appId: 'app-1',
        chatId: 'builder-chat-1',
        clearChatRecords,
        restartChat
      })
    ).rejects.toThrow('delete failed');

    expect(clearChatRecords).not.toHaveBeenCalled();
    expect(restartChat).not.toHaveBeenCalled();
  });

  it('sends only the strict Builder contract while ordinary chat keeps runtime fields', async () => {
    const appId = '67f4c91c79a4d61b1f116b2a';
    const document = WorkflowDocumentSchema.parse(structuredClone(fixture));
    document.app.appId = appId;
    const requestBody = {
      appId,
      chatId: 'workflow-builder-chat',
      messages: [{ role: 'user' as const, content: 'Add an AI node' }],
      workflowContext: {
        document,
        checksum: await getWorkflowChecksum(document)
      }
    };

    const builderBody = buildStreamFetchBody({ data: requestBody, requestMode: 'raw' });
    expect(WorkflowBuilderChatBodySchema.parse(builderBody)).toEqual(requestBody);
    expect(builderBody).not.toHaveProperty('variables');
    expect(builderBody).not.toHaveProperty('detail');
    expect(builderBody).not.toHaveProperty('stream');

    expect(buildStreamFetchBody({ data: { variables: { input: 'value' } } })).toMatchObject({
      variables: { input: 'value', cTime: expect.any(String) },
      detail: true,
      stream: true,
      retainDatasetCite: true
    });
  });

  it('delivers the validated applied document event without mixing it into answer text', async () => {
    const document = WorkflowDocumentSchema.parse(structuredClone(fixture));
    const applied = WorkflowBuilderAppliedSchema.parse({
      baseChecksum: await getWorkflowChecksum(document),
      document,
      checksum: await getWorkflowChecksum(document)
    });
    const onmessage = vi.fn();
    const enqueue = vi.fn();

    handleEventSourceData({
      event: SseResponseEventEnum.workflowBuilderApplied,
      data: JSON.stringify(applied),
      onmessage,
      enqueue,
      onerror: vi.fn()
    });

    expect(onmessage).toHaveBeenCalledWith({
      responseValueId: undefined,
      event: SseResponseEventEnum.workflowBuilderApplied,
      workflowBuilderApplied: applied
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('keeps Builder-applied chatConfig when updating local app detail', () => {
    const document = WorkflowDocumentSchema.parse(structuredClone(fixture));
    document.app.name = 'Builder Result';
    document.app.intro = 'Updated by Builder';
    document.chatConfig.fileSelectConfig = { maxFiles: 1, canSelectFile: true };

    const current = {
      name: 'Old Name',
      intro: 'Old intro',
      chatConfig: {}
    } as Parameters<typeof mergeWorkflowBuilderAppliedAppDetail>[0]['current'];

    expect(
      mergeWorkflowBuilderAppliedAppDetail({
        current,
        targetDocument: document
      })
    ).toMatchObject({
      name: 'Builder Result',
      intro: 'Updated by Builder',
      chatConfig: {
        fileSelectConfig: { maxFiles: 1, canSelectFile: true }
      }
    });
  });
});
