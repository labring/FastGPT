import { type AppChatConfigType, type AppFormEditFormType } from '@fastgpt/global/core/app/type';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';

import { getNanoid } from '@fastgpt/global/common/string/tools';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import {
  WorkflowStart,
  userFilesInput
} from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { SystemConfigNode } from '@fastgpt/global/core/workflow/template/system/systemConfig';
import {
  AiChatModule,
  AiChatQuotePrompt,
  AiChatQuoteRole,
  AiChatQuoteTemplate
} from '@fastgpt/global/core/workflow/template/system/aiChat/index';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { i18nT } from '@fastgpt/web/i18n/utils';
import {
  Input_Template_File_Link,
  Input_Template_UserChatInput
} from '@fastgpt/global/core/workflow/template/input';
import { workflowStartNodeId } from '@/web/core/app/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

/* format app nodes to edit form */
export const appWorkflow2Form = ({
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
    if (
      node.flowNodeType === FlowNodeTypeEnum.chatNode ||
      node.flowNodeType === FlowNodeTypeEnum.toolCall
    ) {
      defaultAppForm.aiSettings.model = findInputValueByKey(node.inputs, NodeInputKeyEnum.aiModel);
      defaultAppForm.aiSettings.systemPrompt = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiSystemPrompt
      );
      defaultAppForm.aiSettings.temperature = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatTemperature
      );
      defaultAppForm.aiSettings.maxToken = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatMaxToken
      );
      defaultAppForm.aiSettings.maxHistories = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.history
      );
      defaultAppForm.aiSettings.aiChatReasoning = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatReasoning
      );
      defaultAppForm.aiSettings.aiChatTopP = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatTopP
      );
      defaultAppForm.aiSettings.aiChatStopSign = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatStopSign
      );
      defaultAppForm.aiSettings.aiChatResponseFormat = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatResponseFormat
      );
      defaultAppForm.aiSettings.aiChatJsonSchema = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatJsonSchema
      );
    } else if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      defaultAppForm.dataset.datasets = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSelectList
      );
      defaultAppForm.dataset.similarity = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSimilarity
      );
      defaultAppForm.dataset.limit = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetMaxTokens
      );
      defaultAppForm.dataset.searchMode =
        findInputValueByKey(node.inputs, NodeInputKeyEnum.datasetSearchMode) ||
        DatasetSearchModeEnum.embedding;
      defaultAppForm.dataset.embeddingWeight = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchEmbeddingWeight
      );
      // Rerank
      defaultAppForm.dataset.usingReRank = !!findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchUsingReRank
      );
      defaultAppForm.dataset.rerankModel = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchRerankModel
      );
      defaultAppForm.dataset.rerankWeight = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchRerankWeight
      );
      // Query extension
      defaultAppForm.dataset.datasetSearchUsingExtensionQuery = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchUsingExtensionQuery
      );
      defaultAppForm.dataset.datasetSearchExtensionModel = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchExtensionModel
      );
      defaultAppForm.dataset.datasetSearchExtensionBg = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchExtensionBg
      );
    } else if (
      node.flowNodeType === FlowNodeTypeEnum.pluginModule ||
      node.flowNodeType === FlowNodeTypeEnum.appModule ||
      node.flowNodeType === FlowNodeTypeEnum.tool ||
      node.flowNodeType === FlowNodeTypeEnum.toolSet
    ) {
      if (!node.pluginId) return;

      defaultAppForm.selectedTools.push({
        id: node.nodeId,
        pluginId: node.pluginId,
        name: node.name,
        avatar: node.avatar,
        intro: node.intro || '',
        flowNodeType: node.flowNodeType,
        showStatus: node.showStatus,
        version: node.version,
        inputs: node.inputs,
        outputs: node.outputs,
        templateType: FlowNodeTemplateTypeEnum.other,
        pluginData: node.pluginData,
        toolConfig: node.toolConfig
      });
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
export function form2AppWorkflow(
  data: AppFormEditFormType,
  t: any // i18nT
): WorkflowType & {
  chatConfig: AppChatConfigType;
} {
  const datasetNodeId = 'iKBoX2vIzETU';
  const aiChatNodeId = '7BdojPlukIQw';
  const selectedDatasets = data.dataset.datasets;
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
  function aiChatTemplate(formData: AppFormEditFormType): StoreNodeItemType {
    return {
      nodeId: aiChatNodeId,
      name: t(AiChatModule.name),
      intro: t(AiChatModule.intro),
      avatar: AiChatModule.avatar,
      flowNodeType: AiChatModule.flowNodeType,
      showStatus: true,
      position: {
        x: 1106.3238387960757,
        y: -350.6030674683474
      },
      version: AiChatModule.version,
      inputs: [
        {
          key: NodeInputKeyEnum.aiModel,
          renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel, FlowNodeInputTypeEnum.reference],
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.aiSettings.model
        },
        {
          key: NodeInputKeyEnum.aiChatTemperature,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          value: formData.aiSettings.temperature,
          valueType: WorkflowIOValueTypeEnum.number,
          min: 0,
          max: 10,
          step: 1
        },
        {
          key: NodeInputKeyEnum.aiChatMaxToken,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          value: formData.aiSettings.maxToken,
          valueType: WorkflowIOValueTypeEnum.number,
          min: 100,
          max: 4000,
          step: 50
        },
        {
          key: NodeInputKeyEnum.aiChatIsResponseText,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          value: true,
          valueType: WorkflowIOValueTypeEnum.boolean
        },
        AiChatQuoteRole,
        AiChatQuoteTemplate,
        AiChatQuotePrompt,
        {
          key: NodeInputKeyEnum.aiSystemPrompt,
          renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
          max: 3000,
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'core.ai.Prompt',
          description: 'core.app.tip.systemPromptTip',
          placeholder: 'core.app.tip.chatNodeSystemPromptTip',
          value: formData.aiSettings.systemPrompt
        },
        {
          key: NodeInputKeyEnum.history,
          renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.chatHistory,
          label: 'core.module.input.label.chat history',
          required: true,
          min: 0,
          max: 30,
          value: formData.aiSettings.maxHistories
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
          key: NodeInputKeyEnum.aiChatDatasetQuote,
          renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
          label: '',
          debugLabel: i18nT('common:core.module.Dataset quote.label'),
          description: '',
          valueType: WorkflowIOValueTypeEnum.datasetQuote,
          value: selectedDatasets?.length > 0 ? [datasetNodeId, 'quoteQA'] : undefined
        },
        {
          ...Input_Template_File_Link,
          value: [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]]
        },
        {
          key: NodeInputKeyEnum.aiChatVision,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.boolean,
          value: true
        },
        {
          key: NodeInputKeyEnum.aiChatReasoning,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.boolean,
          value: formData.aiSettings.aiChatReasoning
        },
        {
          key: NodeInputKeyEnum.aiChatTopP,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.number,
          value: formData.aiSettings.aiChatTopP
        },
        {
          key: NodeInputKeyEnum.aiChatStopSign,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.aiSettings.aiChatStopSign
        },
        {
          key: NodeInputKeyEnum.aiChatResponseFormat,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.aiSettings.aiChatResponseFormat
        },
        {
          key: NodeInputKeyEnum.aiChatJsonSchema,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.aiSettings.aiChatJsonSchema
        }
      ],
      outputs: AiChatModule.outputs
    };
  }
  function datasetNodeTemplate(formData: AppFormEditFormType, question: any): StoreNodeItemType {
    return {
      nodeId: datasetNodeId,
      name: t(DatasetSearchModule.name),
      intro: t('app:dataset_search_tool_description'),
      avatar: DatasetSearchModule.avatar,
      flowNodeType: DatasetSearchModule.flowNodeType,
      showStatus: true,
      position: {
        x: 918.5901682164496,
        y: -227.11542247619582
      },
      version: DatasetSearchModule.version,
      inputs: [
        {
          key: NodeInputKeyEnum.datasetSelectList,
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
          label: i18nT('common:core.module.input.label.Select dataset'),
          value: selectedDatasets,
          valueType: WorkflowIOValueTypeEnum.selectDataset,
          list: [],
          required: true
        },
        {
          key: NodeInputKeyEnum.datasetSimilarity,
          renderTypeList: [FlowNodeInputTypeEnum.selectDatasetParamsModal],
          label: '',
          value: formData.dataset.similarity,
          valueType: WorkflowIOValueTypeEnum.number
        },
        {
          key: NodeInputKeyEnum.datasetMaxTokens,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          value: formData.dataset.limit,
          valueType: WorkflowIOValueTypeEnum.number
        },
        {
          key: NodeInputKeyEnum.datasetSearchMode,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.dataset.searchMode
        },
        {
          key: NodeInputKeyEnum.datasetSearchEmbeddingWeight,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.number,
          value: formData.dataset.embeddingWeight
        },
        {
          key: NodeInputKeyEnum.datasetSearchUsingReRank,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.boolean,
          value: formData.dataset.usingReRank
        },
        {
          key: NodeInputKeyEnum.datasetSearchRerankModel,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.dataset.rerankModel
        },
        {
          key: NodeInputKeyEnum.datasetSearchRerankWeight,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.number,
          value: formData.dataset.rerankWeight
        },
        {
          key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.boolean,
          value: formData.dataset.datasetSearchUsingExtensionQuery
        },
        {
          key: NodeInputKeyEnum.datasetSearchExtensionModel,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.dataset.datasetSearchExtensionModel
        },
        {
          key: NodeInputKeyEnum.datasetSearchExtensionBg,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.dataset.datasetSearchExtensionBg
        },
        {
          ...Input_Template_UserChatInput,
          toolDescription: i18nT('workflow:content_to_search'),
          value: question
        }
      ],
      outputs: DatasetSearchModule.outputs
    };
  }

  // Start, AiChat
  function simpleChatTemplate(formData: AppFormEditFormType): WorkflowType {
    return {
      nodes: [aiChatTemplate(formData)],
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
  // Start, Dataset search, AiChat
  function datasetTemplate(formData: AppFormEditFormType): WorkflowType {
    return {
      nodes: [
        aiChatTemplate(formData),
        datasetNodeTemplate(formData, [workflowStartNodeId, 'userChatInput'])
      ],
      edges: [
        {
          source: workflowStartNodeId,
          target: datasetNodeId,
          sourceHandle: `${workflowStartNodeId}-source-right`,
          targetHandle: `${datasetNodeId}-target-left`
        },
        {
          source: datasetNodeId,
          target: aiChatNodeId,
          sourceHandle: `${datasetNodeId}-source-right`,
          targetHandle: `${aiChatNodeId}-target-left`
        }
      ]
    };
  }
  function toolTemplates(formData: AppFormEditFormType): WorkflowType {
    const toolNodeId = getNanoid(6);

    // Dataset tool config
    const datasetTool: WorkflowType | null =
      selectedDatasets.length > 0
        ? {
            nodes: [datasetNodeTemplate(formData, '')],
            edges: [
              {
                source: toolNodeId,
                target: datasetNodeId,
                sourceHandle: 'selectedTools',
                targetHandle: 'selectedTools'
              }
            ]
          }
        : null;

    // Computed tools config
    const pluginTool: WorkflowType[] = formData.selectedTools.map((tool, i) => {
      const nodeId = getNanoid(6);
      return {
        nodes: [
          {
            nodeId,
            id: tool.id,
            pluginId: tool.pluginId,
            name: tool.name,
            intro: tool.intro,
            toolDescription: tool.toolDescription,
            avatar: tool.avatar,
            flowNodeType: tool.flowNodeType,
            showStatus: tool.showStatus,
            position: {
              x: 500 + 500 * (i + 1),
              y: 545
            },
            toolConfig: tool.toolConfig,
            pluginData: tool.pluginData,
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
                  value: formData.aiSettings.maxHistories
                };
              }
              return input;
            }),
            outputs: tool.outputs
          }
        ],
        edges: [
          {
            source: toolNodeId,
            target: nodeId,
            sourceHandle: 'selectedTools',
            targetHandle: 'selectedTools'
          }
        ]
      };
    });

    const config: WorkflowType = {
      nodes: [
        {
          nodeId: toolNodeId,
          name: ToolCallNode.name,
          intro: ToolCallNode.intro,
          avatar: ToolCallNode.avatar,
          flowNodeType: ToolCallNode.flowNodeType,
          showStatus: true,
          position: {
            x: 1062.1738942532802,
            y: -223.65033022650476
          },
          version: ToolCallNode.version,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModel,
              renderTypeList: [
                FlowNodeInputTypeEnum.settingLLMModel,
                FlowNodeInputTypeEnum.reference
              ],
              label: 'core.module.input.label.aiModel',
              valueType: WorkflowIOValueTypeEnum.string,
              llmModelType: 'all',
              value: formData.aiSettings.model
            },
            {
              key: 'temperature',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              value: formData.aiSettings.temperature,
              valueType: WorkflowIOValueTypeEnum.number,
              min: 0,
              max: 10,
              step: 1
            },
            {
              key: 'maxToken',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              value: formData.aiSettings.maxToken,
              valueType: WorkflowIOValueTypeEnum.number,
              min: 100,
              max: 4000,
              step: 50
            },
            {
              key: 'systemPrompt',
              renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
              max: 3000,
              valueType: WorkflowIOValueTypeEnum.string,
              label: 'core.ai.Prompt',
              description: 'core.app.tip.systemPromptTip',
              placeholder: 'core.app.tip.chatNodeSystemPromptTip',
              value: formData.aiSettings.systemPrompt
            },
            {
              key: 'history',
              renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
              valueType: WorkflowIOValueTypeEnum.chatHistory,
              label: 'core.module.input.label.chat history',
              required: true,
              min: 0,
              max: 30,
              value: formData.aiSettings.maxHistories
            },
            {
              ...Input_Template_File_Link,
              value: [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]]
            },
            {
              key: 'userChatInput',
              renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
              valueType: WorkflowIOValueTypeEnum.string,
              label: i18nT('common:core.module.input.label.user question'),
              required: true,
              value: [workflowStartNodeId, 'userChatInput']
            },
            {
              key: NodeInputKeyEnum.aiChatVision,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.boolean,
              value: true
            },
            {
              key: NodeInputKeyEnum.aiChatReasoning,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.boolean,
              value: formData.aiSettings.aiChatReasoning
            }
          ],
          outputs: ToolCallNode.outputs
        },
        // tool nodes
        ...(datasetTool ? datasetTool.nodes : []),
        ...pluginTool.map((tool) => tool.nodes).flat()
      ],
      edges: [
        {
          source: workflowStartNodeId,
          target: toolNodeId,
          sourceHandle: `${workflowStartNodeId}-source-right`,
          targetHandle: `${toolNodeId}-target-left`
        },
        // tool edges
        ...(datasetTool ? datasetTool.edges : []),
        ...pluginTool.map((tool) => tool.edges).flat()
      ]
    };

    // Add t
    config.nodes.forEach((node) => {
      node.name = t(node.name);
      node.intro = t(node.intro);

      node.inputs.forEach((input) => {
        input.label = t(input.label);
        input.description = t(input.description);
        input.toolDescription = t(input.toolDescription);
      });
    });

    return config;
  }

  const workflow = (() => {
    if (data.selectedTools.length > 0) return toolTemplates(data);
    if (selectedDatasets.length > 0) return datasetTemplate(data);
    return simpleChatTemplate(data);
  })();

  return {
    nodes: [systemConfigTemplate(), workflowStartTemplate(), ...workflow.nodes],
    edges: workflow.edges,
    chatConfig: data.chatConfig
  };
}
