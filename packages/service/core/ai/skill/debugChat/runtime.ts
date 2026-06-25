import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';

const START_NODE_ID = 'skill-debug-start';
const AGENT_NODE_ID = 'skill-debug-agent';

/**
 * 构造 Skill 调试对话使用的最小 workflow。
 *
 * 运行态只包含 workflowStart -> agent 两个节点；agent 通过 editSkillId 进入当前
 * Skill 的编辑沙盒，避免调试链路依赖真实应用配置。
 */
export function buildDebugRuntimeNodes(
  skillId: string,
  model: string,
  systemPrompt: string
): {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
} {
  const runtimeNodes: RuntimeNodeItemType[] = [
    {
      nodeId: START_NODE_ID,
      name: 'Workflow Start',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      showStatus: false,
      isEntry: true,
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'User Question',
          toolDescription: 'user question',
          required: true,
          value: ''
        }
      ],
      outputs: [
        {
          id: NodeOutputKeyEnum.userChatInput,
          key: NodeOutputKeyEnum.userChatInput,
          label: 'User Question',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    },
    {
      nodeId: AGENT_NODE_ID,
      name: 'Agent',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.agent,
      showStatus: true,
      isEntry: false,
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'User Question',
          required: true,
          value: [START_NODE_ID, NodeOutputKeyEnum.userChatInput]
        },
        {
          key: NodeInputKeyEnum.history,
          renderTypeList: [FlowNodeInputTypeEnum.numberInput],
          valueType: WorkflowIOValueTypeEnum.chatHistory,
          label: 'Chat History',
          required: true,
          min: 0,
          max: 50,
          value: 20
        },
        {
          key: NodeInputKeyEnum.aiModel,
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
          label: 'AI Model',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          value: model
        },
        {
          key: NodeInputKeyEnum.aiSystemPrompt,
          renderTypeList: [FlowNodeInputTypeEnum.textarea],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'System Prompt',
          value: systemPrompt
        },
        {
          key: NodeInputKeyEnum.editSkillId,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'Edit Skill ID',
          value: skillId
        }
      ],
      outputs: [
        {
          id: NodeOutputKeyEnum.answerText,
          key: NodeOutputKeyEnum.answerText,
          label: 'Answer',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    }
  ];

  const runtimeEdges: RuntimeEdgeItemType[] = [
    {
      source: START_NODE_ID,
      sourceHandle: getHandleId(START_NODE_ID, 'source', 'right'),
      target: AGENT_NODE_ID,
      targetHandle: getHandleId(AGENT_NODE_ID, 'target', 'left'),
      status: 'waiting'
    }
  ];

  return { runtimeNodes, runtimeEdges };
}
