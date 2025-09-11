import type { AppChatConfigType, AppFormEditFormType } from '@fastgpt/global/core/app/type';
import type {
  FlowNodeTemplateType,
  StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node.d';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';

import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  WorkflowStart,
  userFilesInput
} from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { SystemConfigNode } from '@fastgpt/global/core/workflow/template/system/systemConfig';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { workflowStartNodeId } from '@/web/core/app/constants';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent/index';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { Input_Template_File_Link } from '@fastgpt/global/core/workflow/template/input';

/* format app nodes to edit form */
export const appWorkflow2AgentForm = ({
  nodes,
  chatConfig
}: {
  nodes: StoreNodeItemType[];
  chatConfig: AppChatConfigType;
}) => {
  const defaultAppForm = getDefaultAppForm();
  const findInputValueByKey = (inputs: FlowNodeInputItemType[], key: string) => {
    return inputs.find((item) => item.key === key)?.value;
  };

  nodes.forEach((node) => {
    const inputMap = new Map(node.inputs.map((input) => [input.key, input.value]));
    if (node.flowNodeType === FlowNodeTypeEnum.agent) {
      defaultAppForm.aiSettings.model = findInputValueByKey(node.inputs, NodeInputKeyEnum.aiModel);
      defaultAppForm.aiSettings.systemPrompt = inputMap.get(NodeInputKeyEnum.aiSystemPrompt);
      defaultAppForm.aiSettings.temperature = inputMap.get(NodeInputKeyEnum.aiChatTemperature);
      defaultAppForm.aiSettings.maxHistories = inputMap.get(NodeInputKeyEnum.history);
      defaultAppForm.aiSettings.aiChatTopP = inputMap.get(NodeInputKeyEnum.aiChatTopP);

      const subApps = inputMap.get(NodeInputKeyEnum.subApps) as FlowNodeTemplateType[];

      if (subApps) {
        subApps.forEach((subApp) => {
          defaultAppForm.selectedTools.push(subApp);
        });
      }
    } else if (node.flowNodeType === FlowNodeTypeEnum.systemConfig) {
      defaultAppForm.chatConfig = getAppChatConfig({
        chatConfig,
        systemConfigNode: node,
        isPublicFetch: true
      });
    }
  });

  return defaultAppForm;
};

export type WorkflowType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
};
export function agentForm2AppWorkflow(
  data: AppFormEditFormType,
  t: any // i18nT
): WorkflowType & {
  chatConfig: AppChatConfigType;
} {
  const aiChatNodeId = '7BdojPlukIQw';
  function systemConfigTemplate(): StoreNodeItemType {
    return {
      nodeId: SystemConfigNode.id,
      name: t(SystemConfigNode.name),
      intro: '',
      flowNodeType: SystemConfigNode.flowNodeType,
      position: {
        x: 531.2422736065552,
        y: -486.7611729549753
      },
      version: SystemConfigNode.version,
      inputs: [],
      outputs: []
    };
  }
  function workflowStartTemplate(): StoreNodeItemType {
    return {
      nodeId: workflowStartNodeId,
      name: t(WorkflowStart.name),
      intro: '',
      avatar: WorkflowStart.avatar,
      flowNodeType: WorkflowStart.flowNodeType,
      position: {
        x: 558.4082376415505,
        y: 123.72387429194112
      },
      version: WorkflowStart.version,
      inputs: WorkflowStart.inputs,
      outputs: [...WorkflowStart.outputs, userFilesInput]
    };
  }
  function agentChatTemplate(): WorkflowType {
    return {
      nodes: [
        {
          nodeId: aiChatNodeId,
          name: t(AgentNode.name),
          intro: t(AgentNode.intro),
          avatar: AgentNode.avatar,
          flowNodeType: AgentNode.flowNodeType,
          showStatus: true,
          position: {
            x: 1106.3238387960757,
            y: -350.6030674683474
          },
          version: AgentNode.version,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModel,
              renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
              label: t('common:core.module.input.label.aiModel'),
              valueType: WorkflowIOValueTypeEnum.string,
              value: data.aiSettings.model
            },
            {
              key: NodeInputKeyEnum.aiSystemPrompt,
              renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
              max: 3000,
              valueType: WorkflowIOValueTypeEnum.string,
              label: t('common:core.ai.Prompt'),
              description: t('common:core.app.tip.systemPromptTip'),
              placeholder: t('common:core.app.tip.chatNodeSystemPromptTip'),
              value: data.aiSettings.systemPrompt
            },
            {
              ...Input_Template_File_Link,
              value: [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]]
            },
            {
              key: NodeInputKeyEnum.aiChatTemperature,
              renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
              label: '',
              valueType: WorkflowIOValueTypeEnum.number
            },
            {
              key: NodeInputKeyEnum.aiChatTopP,
              renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
              label: '',
              valueType: WorkflowIOValueTypeEnum.number
            },
            {
              key: NodeInputKeyEnum.history,
              renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
              valueType: WorkflowIOValueTypeEnum.chatHistory,
              label: 'core.module.input.label.chat history',
              required: true,
              min: 0,
              max: 30,
              value: data.aiSettings.maxHistories
            },
            {
              key: NodeInputKeyEnum.userChatInput,
              renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
              valueType: WorkflowIOValueTypeEnum.string,
              label: i18nT('common:core.module.input.label.user question'),
              required: true,
              toolDescription: i18nT('common:core.module.input.label.user question'),
              value: [workflowStartNodeId, NodeInputKeyEnum.userChatInput]
            },
            {
              key: NodeInputKeyEnum.subApps,
              renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
              label: '',
              valueType: WorkflowIOValueTypeEnum.object,
              value: data.selectedTools.map((tool) => ({
                ...tool,
                inputs: tool.inputs.map((input) => {
                  // Special key value
                  if (input.key === NodeInputKeyEnum.forbidStream) {
                    input.value = true;
                  }
                  // Special tool
                  if (
                    tool.flowNodeType === FlowNodeTypeEnum.appModule &&
                    input.key === NodeInputKeyEnum.history
                  ) {
                    return {
                      ...input,
                      value: data.aiSettings.maxHistories
                    };
                  }
                  return input;
                })
              }))
            }
          ],
          outputs: AgentNode.outputs
        }
      ],
      edges: [
        {
          source: workflowStartNodeId,
          target: aiChatNodeId,
          sourceHandle: `${workflowStartNodeId}-source-right`,
          targetHandle: `${aiChatNodeId}-target-left`
        }
      ]
    };
  }

  const workflow = agentChatTemplate();
  return {
    nodes: [systemConfigTemplate(), workflowStartTemplate(), ...workflow.nodes],
    edges: workflow.edges,
    chatConfig: data.chatConfig
  };
}
