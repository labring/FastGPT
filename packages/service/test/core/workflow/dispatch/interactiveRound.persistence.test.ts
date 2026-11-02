import { expect, it } from 'vitest';
import { graphNode, graphEdge, runGraph } from './testUtils/workflowGraph';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  getLastInteractiveValue,
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges
} from '@fastgpt/global/core/workflow/runtime/utils';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { preChatRound } from '@fastgpt/service/core/chat/utils/prepare';
import { finalizeChatRound, updateInteractiveChat } from '@fastgpt/service/core/chat/saveChat';
import { updateChatGenerateStatus } from '@fastgpt/service/core/chat/chatGenerateStatus';

it.each([false, true])(
  'resumes persisted form and select in one round with legacy null descriptions=%s',
  async (legacy) => {
    // 对应用户导出的“回复 → 表单 → 用户选择 → 回复”：两个交互均未填写说明文字。
    const nodes = [
      graphNode({
        id: 'answer',
        type: FlowNodeTypeEnum.answerNode,
        params: { text: '我是子工作流' },
        isEntry: true
      }),
      graphNode({
        id: 'form',
        type: FlowNodeTypeEnum.formInput,
        params: {
          description: undefined,
          userInputForms: [
            {
              type: FlowNodeInputTypeEnum.input,
              key: '表单',
              label: '表单',
              valueType: WorkflowIOValueTypeEnum.string,
              required: false,
              defaultValue: '22'
            }
          ]
        }
      }),
      graphNode({
        id: 'select',
        type: FlowNodeTypeEnum.userSelect,
        params: {
          description: undefined,
          userSelectOptions: [
            { key: 'yes', value: 'Confirm' },
            { key: 'no', value: 'Cancel' }
          ]
        }
      }),
      graphNode({ id: 'end', type: FlowNodeTypeEnum.answerNode, params: { text: '子工作流结束' } })
    ];
    const edges = [
      graphEdge({ source: 'answer', target: 'form' }),
      graphEdge({ source: 'form', target: 'select' }),
      ...['yes', 'no'].map((handle) => graphEdge({ source: 'select', target: 'end', handle }))
    ];
    nodes.forEach((node) => {
      if (node.flowNodeType === FlowNodeTypeEnum.answerNode) {
        node.inputs[0].selectedType = FlowNodeInputTypeEnum.textarea;
        node.inputs[0].renderTypeList = [FlowNodeInputTypeEnum.textarea];
      }
    });
    const source = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '67e0d5535c02d1d5cdede721',
      chatId: `interactive-${legacy}`
    };
    const props = {
      ...source,
      teamId: '654a4107c32f3bf5f998452f',
      tmbId: '65ab7007462ada7dbb899948',
      source: 'test' as const,
      responseChatItemId: 'round-id',
      fixedTitle: 'interactive test'
    };
    const input = (text: string): UserChatItemType => ({
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: text } }]
    });

    /** 从数据库恢复交互，并经过与 API 相同的占位准备、执行、结果保存流程。 */
    const runRound = async (text: string, histories: ChatItemMiniType[] = []) => {
      const interactive = getLastInteractiveValue(histories);
      const userContent = input(text);
      const prepared = await preChatRound({ ...props, userContent, interactive });
      await prepared.titleGeneration;
      expect(prepared.responseChatItemId).toBe('round-id');
      expect(prepared.shouldFinalizePreparedRound).toBe(histories.length === 0);
      const { result, responses } = await runGraph({
        nodes: structuredClone(nodes).map((node) => ({
          ...node,
          isEntry: histories.length
            ? getWorkflowEntryNodeIds(nodes, interactive).includes(node.nodeId)
            : node.nodeId === 'answer'
        })),
        edges: storeEdges2RuntimeEdges(edges, interactive),
        overrides: { lastInteractive: interactive, histories, query: userContent.value }
      });
      expect(result.workflowRuntimeSummary.errorCount, JSON.stringify(responses)).toBe(0);
      const pending = result.workflowInteractiveResponse;
      if (pending?.type === 'userInput' || pending?.type === 'userSelect') {
        expect(pending.params.description).toBe('');
        if (legacy) {
          // 重现修复前未填说明的快照；Mongo 更新会把 Mixed 内显式 undefined 写为 null。
          Object.assign(pending.params, { description: undefined });
        }
      }
      const saveProps = {
        ...props,
        nodes: [],
        userContent,
        aiContent: {
          obj: ChatRoleEnum.AI as const,
          dataId: prepared.responseChatItemId,
          value: result.assistantResponses
        },
        variables: {},
        durationSeconds: 1
      };
      if (interactive) {
        await updateInteractiveChat({ ...saveProps, interactive });
        await updateChatGenerateStatus({ ...source, status: ChatGenerateStatusEnum.done });
      } else {
        await finalizeChatRound(saveProps);
      }
      const saved = await getChatItems({ ...source, offset: 0, limit: 20, field: 'obj value' });
      if (legacy && result.workflowInteractiveResponse) {
        const ai = saved.histories.findLast((item) => item.obj === ChatRoleEnum.AI);
        expect(ai?.value.at(-1)).toMatchObject({ interactive: { params: { description: null } } });
      }
      return saved.histories;
    };

    const awaitingForm = await runRound('1');
    expect(getLastInteractiveValue(awaitingForm)?.type).toBe('userInput');
    const awaitingChoice = await runRound(JSON.stringify({ 表单: '22' }), awaitingForm);
    expect(getLastInteractiveValue(awaitingChoice)?.type).toBe('userSelect');
    const completed = await runRound('Confirm', awaitingChoice);
    expect(getLastInteractiveValue(completed)).toBeUndefined();
    expect(completed.at(-1)?.value).toContainEqual({ text: { content: '\n子工作流结束' } });
    expect(
      await MongoChatItem.countDocuments({ appId: source.sourceId, chatId: source.chatId })
    ).toBe(2);
  }
);
