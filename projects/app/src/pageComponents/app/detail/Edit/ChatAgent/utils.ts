import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type {
  FlowNodeTemplateType,
  StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
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
import {
  getToolConfigStatus,
  validateToolConfiguration
} from '@fastgpt/global/core/app/formEdit/utils';
import { getToolPreviewNode } from '@/web/core/app/api/tool';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config';

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
      defaultAppForm.aiSettings.aiRole = inputMap.get(NodeInputKeyEnum.aiRole);
      defaultAppForm.aiSettings.aiTaskObject = inputMap.get(NodeInputKeyEnum.aiTaskObject);
      defaultAppForm.aiSettings.temperature = inputMap.get(NodeInputKeyEnum.aiChatTemperature);
      defaultAppForm.aiSettings.maxHistories = inputMap.get(NodeInputKeyEnum.history);
      defaultAppForm.aiSettings.aiChatTopP = inputMap.get(NodeInputKeyEnum.aiChatTopP);

      const tools = inputMap.get(NodeInputKeyEnum.selectedTools) as FlowNodeTemplateType[];
      if (tools) {
        defaultAppForm.selectedTools = tools.map((tool) => ({
          ...tool,
          configStatus: getToolConfigStatus(tool).status
        }));
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
              key: NodeInputKeyEnum.aiRole,
              renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
              valueType: WorkflowIOValueTypeEnum.string,
              label: t('app:ai_role'),
              value: data.aiSettings.aiRole
            },
            {
              key: NodeInputKeyEnum.aiTaskObject,
              renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
              valueType: WorkflowIOValueTypeEnum.string,
              label: t('app:task_object'),
              value: data.aiSettings.aiTaskObject
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
              key: NodeInputKeyEnum.selectedTools,
              renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
              label: '',
              valueType: WorkflowIOValueTypeEnum.arrayObject,
              value: data.selectedTools.map((tool) => ({
                id: tool.pluginId,

                config: tool.inputs.reduce(
                  (acc, input) => {
                    // Special tool
                    if (
                      tool.flowNodeType === FlowNodeTypeEnum.appModule &&
                      input.key === NodeInputKeyEnum.history
                    ) {
                      acc[input.key] = data.aiSettings.maxHistories;
                    }
                    acc[input.key] = input.value;
                    return acc;
                  },
                  {} as Record<string, any>
                )
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

export const loadGeneratedTools = async ({
  newToolIds,
  existsTools = [],
  topAgentSelectedTools = [],
  fileSelectConfig
}: {
  newToolIds: string[]; // 新的，完整的 toolId
  existsTools?: SelectedToolItemType[];
  topAgentSelectedTools?: SelectedToolItemType[];
  fileSelectConfig?: AppFileSelectConfigType;
}): Promise<SelectedToolItemType[]> => {
  const results = (
    await Promise.all(
      newToolIds.map<Promise<SelectedToolItemType | undefined>>(async (toolId: string) => {
        // 已经存在的工具，直接返回
        const existTool = existsTools.find((tool) => tool.pluginId === toolId);
        if (existTool) {
          return existTool;
        }

        // 新工具，需要与已配置的 tool 进行 input 合并
        const tool = await getToolPreviewNode({ appId: toolId });
        // 验证工具配置
        const toolValid = validateToolConfiguration({
          toolTemplate: tool,
          canSelectFile: fileSelectConfig?.canSelectFile,
          canSelectImg: fileSelectConfig?.canSelectImg
        });
        if (!toolValid) {
          return;
        }

        const topTool = topAgentSelectedTools.find((item) => item.pluginId === toolId);
        if (topTool) {
          tool.inputs.forEach((input) => {
            const topInput = topTool.inputs.find((topIn) => topIn.key === input.key);
            if (topInput) {
              input.value = topInput.value;
            }
          });
        }

        return {
          ...tool,
          configStatus: getToolConfigStatus(tool).status
        };
      })
    )
  ).filter((item) => item !== undefined);

  return results;
};
