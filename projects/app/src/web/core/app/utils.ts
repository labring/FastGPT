import {
  AppChatConfigType,
  AppDetailType,
  AppSchema,
  AppSimpleEditFormType
} from '@fastgpt/global/core/app/type';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import {
  chatHistoryValueDesc,
  defaultNodeVersion,
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';

import { getNanoid } from '@fastgpt/global/common/string/tools';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import { ToolModule } from '@fastgpt/global/core/workflow/template/system/tools';
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
import { workflowStartNodeId } from './constants';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getAppType } from '@fastgpt/global/core/app/utils';
import { postCreateApp } from './api';
import { appTypeMap } from '@/pageComponents/app/constants';

type WorkflowType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
};
export function form2AppWorkflow(
  data: AppSimpleEditFormType,
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
  function aiChatTemplate(formData: AppSimpleEditFormType): StoreNodeItemType {
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
  function datasetNodeTemplate(formData: AppSimpleEditFormType, question: any): StoreNodeItemType {
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
  function simpleChatTemplate(formData: AppSimpleEditFormType): WorkflowType {
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
  function datasetTemplate(formData: AppSimpleEditFormType): WorkflowType {
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
  function toolTemplates(formData: AppSimpleEditFormType): WorkflowType {
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
            avatar: tool.avatar,
            flowNodeType: tool.flowNodeType,
            showStatus: tool.showStatus,
            position: {
              x: 500 + 500 * (i + 1),
              y: 545
            },
            // 这里不需要固定版本，给一个不存在的版本，每次都会用最新版
            version: defaultNodeVersion,
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
          name: ToolModule.name,
          intro: ToolModule.intro,
          avatar: ToolModule.avatar,
          flowNodeType: ToolModule.flowNodeType,
          showStatus: true,
          position: {
            x: 1062.1738942532802,
            y: -223.65033022650476
          },
          version: ToolModule.version,
          inputs: [
            {
              key: 'model',
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
          outputs: ToolModule.outputs
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
export function filterSensitiveFormData(appForm: AppSimpleEditFormType) {
  const defaultAppForm = getDefaultAppForm();
  return {
    ...appForm,
    dataset: defaultAppForm.dataset
  };
}

export const workflowSystemVariables: EditorVariablePickerType[] = [
  {
    key: 'userId',
    label: i18nT('workflow:use_user_id'),
    required: true,
    valueType: WorkflowIOValueTypeEnum.string
  },
  {
    key: 'appId',
    label: i18nT('common:core.module.http.AppId'),
    required: true,
    valueType: WorkflowIOValueTypeEnum.string
  },
  {
    key: 'chatId',
    label: i18nT('common:core.module.http.ChatId'),
    valueType: WorkflowIOValueTypeEnum.string,
    required: true
  },
  {
    key: 'responseChatItemId',
    label: i18nT('common:core.module.http.ResponseChatItemId'),
    valueType: WorkflowIOValueTypeEnum.string,
    required: true
  },
  {
    key: 'histories',
    label: i18nT('common:core.module.http.Histories'),
    required: true,
    valueType: WorkflowIOValueTypeEnum.chatHistory,
    valueDesc: chatHistoryValueDesc
  },
  {
    key: 'cTime',
    label: i18nT('common:core.module.http.Current time'),
    required: true,
    valueType: WorkflowIOValueTypeEnum.string
  }
];

export const getAppQGuideCustomURL = (appDetail: AppDetailType | AppSchema): string => {
  return (
    appDetail?.modules
      .find((m) => m.flowNodeType === FlowNodeTypeEnum.systemConfig)
      ?.inputs.find((i) => i.key === NodeInputKeyEnum.chatInputGuide)?.value.customUrl || ''
  );
};

/**
 * 从URL获取工作流JSON数据
 */
export const fetchWorkflowFromUrl = async (url: string) => {
  // 自定义响应类型，用于手动处理剪贴板内容
  type CustomResponse = {
    text: () => Promise<string>;
    ok: boolean;
    status: number;
    headers: {
      get: (name: string) => string | null;
    };
  };

  try {
    if (!url || typeof url !== 'string') {
      throw new Error('WORKFLOW_IMPORT_ERROR: URL为空或格式错误');
    }

    // 清理URL
    let fetchUrl = url.trim();

    // 如果URL最后有斜杠，移除它
    if (fetchUrl.endsWith('/')) {
      fetchUrl = fetchUrl.slice(0, -1);
    }

    // 确保URL是绝对路径
    if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
      fetchUrl = `https://${fetchUrl}`;
    }

    // 设置请求超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    try {
      // 首先检查这是否是本地请求（localhost或127.0.0.1）
      const isLocalRequest = fetchUrl.includes('localhost') || fetchUrl.includes('127.0.0.1');

      if (isLocalRequest) {
        try {
          // 尝试方法1: 使用相对路径（如果URL是指向同一个域的不同端口）
          const urlObj = new URL(fetchUrl);
          const path = urlObj.pathname + urlObj.search;
          console.log(`尝试使用相对路径请求: ${path}`);
          const relativeResponse = await fetch(path, {
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          }).catch((e) => {
            console.log(`相对路径请求失败: ${e.message}`);
            return null;
          });

          if (relativeResponse?.ok) {
            clearTimeout(timeoutId);
            const text = await relativeResponse.text();
            return JSON.parse(text);
          }
        } catch (err: any) {
          console.log(`相对路径方法失败: ${err.message}`);
        }

        // 尝试方法2: 如果是本地开发环境，建议用户手动复制JSON
        const userConfirmed = window.confirm(
          `由于CORS限制，无法直接从 ${fetchUrl} 获取工作流数据。\n\n` +
            '请手动打开该URL，复制JSON内容，然后点击"确定"来粘贴。\n\n' +
            '或者点击"取消"放弃导入。'
        );

        if (userConfirmed) {
          try {
            const clipboardText = await navigator.clipboard.readText().catch(() => '');
            if (clipboardText) {
              try {
                return JSON.parse(clipboardText);
              } catch (err) {
                throw new Error('剪贴板内容不是有效的JSON格式，请确保复制了完整的JSON数据');
              }
            } else {
              throw new Error('无法读取剪贴板内容，请确保已授予网站剪贴板权限');
            }
          } catch (err) {
            console.error('读取剪贴板失败:', err);

            // 如果剪贴板读取失败，提供手动输入选项
            const jsonInput = window.prompt('无法自动读取剪贴板。请手动粘贴工作流JSON数据:', '');

            if (jsonInput) {
              try {
                return JSON.parse(jsonInput);
              } catch (err) {
                throw new Error('输入的内容不是有效的JSON格式');
              }
            } else {
              throw new Error('未提供JSON数据，导入已取消');
            }
          }
        } else {
          throw new Error('用户取消了导入操作');
        }
      }

      // 如果不是本地请求，尝试正常请求
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        mode: 'cors' // 尝试CORS
      }).catch(async (err) => {
        console.log(`直接请求失败: ${err.message}，尝试替代方法`);

        // 如果是CORS错误，尝试使用no-cors模式（但这会导致不能读取响应内容）
        if (
          err.message &&
          (err.message.includes('CORS') ||
            err.message.includes('网络') ||
            err.message.includes('network'))
        ) {
          console.log('检测到CORS错误，提示用户手动获取JSON数据');

          const userConfirmed = window.confirm(
            `由于CORS限制，无法直接从 ${fetchUrl} 获取工作流数据。\n\n` +
              '请手动打开该URL，复制JSON内容，然后点击"确定"来粘贴。\n\n' +
              '或者点击"取消"放弃导入。'
          );

          if (userConfirmed) {
            try {
              const clipboardText = await navigator.clipboard.readText().catch(() => '');
              if (clipboardText) {
                try {
                  const customResponse: CustomResponse = {
                    text: () => Promise.resolve(clipboardText),
                    ok: true,
                    status: 200,
                    headers: {
                      get: (name: string) => (name === 'content-type' ? 'application/json' : null)
                    }
                  };
                  return customResponse;
                } catch (err) {
                  throw new Error('剪贴板内容不是有效的JSON格式，请确保复制了完整的JSON数据');
                }
              } else {
                throw new Error('无法读取剪贴板内容，请确保已授予网站剪贴板权限');
              }
            } catch (err) {
              console.error('读取剪贴板失败:', err);

              // 如果剪贴板读取失败，提供手动输入选项
              const jsonInput = window.prompt('无法自动读取剪贴板。请手动粘贴工作流JSON数据:', '');

              if (jsonInput) {
                const customResponse: CustomResponse = {
                  text: () => Promise.resolve(jsonInput),
                  ok: true,
                  status: 200,
                  headers: {
                    get: (name: string) => (name === 'content-type' ? 'application/json' : null)
                  }
                };
                return customResponse;
              } else {
                throw new Error('未提供JSON数据，导入已取消');
              }
            }
          } else {
            throw new Error('用户取消了导入操作');
          }
        }

        throw err;
      });

      clearTimeout(timeoutId);

      console.log(`获取状态码: ${response.status}`);

      if (!response.ok) {
        throw new Error(`获取工作流失败，HTTP错误状态: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      console.log(`响应内容类型: ${contentType}`);

      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`警告：响应内容类型不是JSON (${contentType})`);
      }

      const text = await response.text();
      console.log(`获取到响应内容长度: ${text.length}`);

      if (!text || text.trim() === '') {
        throw new Error('获取的响应内容为空');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonError) {
        console.error('JSON解析失败:', jsonError);
        throw new Error('无法解析响应内容为JSON，请确保URL返回有效的JSON数据');
      }

      console.log('工作流数据获取成功', data ? '数据有效' : '数据为空');

      if (!data) {
        throw new Error('获取的工作流数据为空');
      }

      return data;
    } catch (fetchError: any) {
      if (fetchError.name === 'AbortError') {
        throw new Error('获取工作流超时，请检查URL是否正确或稍后重试');
      } else if (fetchError.message && fetchError.message.includes('CORS')) {
        throw new Error('CORS错误：无法访问该URL，请确保URL允许跨域请求或使用支持CORS的端点');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('获取工作流数据失败:', error);
    throw new Error(`获取工作流失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * 从URL获取工作流JSON数据并创建应用
 */
export const importWorkflowFromUrl = async ({
  url,
  name,
  parentId
}: {
  url: string;
  name?: string;
  parentId?: string;
}) => {
  try {
    console.log(`开始从URL导入工作流: ${url}`);

    // 获取工作流数据
    const data = await fetchWorkflowFromUrl(url);

    if (!data || !data.nodes || !data.edges) {
      throw new Error('工作流数据格式不正确，缺少nodes或edges');
    }

    // 获取应用类型
    const appType = getAppType(data);
    if (!appType) {
      throw new Error('无法识别应用类型，请确保导入的是有效的工作流JSON');
    }

    console.log(`识别到工作流类型: ${appType}`);

    // 创建应用
    const appId = await postCreateApp({
      parentId,
      avatar: appTypeMap[appType].avatar,
      name: name || `未命名 ${new Date().toLocaleString()}`,
      type: appType,
      modules: data.nodes || [],
      edges: data.edges || [],
      chatConfig: data.chatConfig || {}
    });

    console.log(`工作流导入成功，创建的应用ID: ${appId}`);
    return appId;
  } catch (error) {
    console.error('导入工作流失败:', error);
    throw error;
  }
};
