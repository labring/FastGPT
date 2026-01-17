import {
  type AppChatConfigType,
  type AppDetailType,
  type AppSchema,
  type AppSimpleEditFormType
} from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import {
  chatHistoryValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';

import { getNanoid } from '@fastgpt/global/common/string/tools';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { type EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
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

type WorkflowType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
};
export function form2AppWorkflow(
  data: AppSimpleEditFormType,
  t: any, // i18nT
  appType?: AppTypeEnum
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
          key: NodeInputKeyEnum.datasetSearchRerankMethod,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.dataset.rerankMethod
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
        },
        {
          key: NodeInputKeyEnum.generateSqlModel,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: i18nT('common:search_model'),
          valueType: WorkflowIOValueTypeEnum.string,
          value: formData.dataset.generateSqlModel
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

  function createConditionCheckerNode(
    nodeId: string,
    position: { x: number; y: number }
  ): StoreNodeItemType {
    return {
      nodeId,
      name: i18nT('workflow:customer_service.enable_fallback_reply_node_name'),
      intro: i18nT('workflow:execute_different_branches_based_on_conditions'),
      avatar: 'core/workflow/template/ifelse',
      flowNodeType: FlowNodeTypeEnum.ifElseNode,
      showStatus: true,
      position,
      version: '481',
      inputs: [
        {
          key: 'ifElseList',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.any,
          label: '',
          value: [
            {
              condition: 'AND',
              list: [
                {
                  variable: [datasetNodeId, 'quoteQA'],
                  condition: 'isEmpty',
                  valueType: 'input'
                }
              ]
            }
          ]
        }
      ],
      outputs: [
        {
          id: 'ifElseResult',
          key: 'ifElseResult',
          label: i18nT('workflow:judgment_result'),
          valueType: WorkflowIOValueTypeEnum.string,
          type: FlowNodeOutputTypeEnum.static
        }
      ]
    };
  }

  function createFallbackReplyNode(
    nodeId: string,
    position: { x: number; y: number }
  ): StoreNodeItemType {
    return {
      nodeId,
      name: i18nT('workflow:customer_service.fallback_reply_node_name'),
      intro: i18nT('workflow:intro_assigned_reply'),
      avatar: 'core/workflow/template/reply',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      position,
      version: '481',
      inputs: [
        {
          key: 'text',
          renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.any,
          required: true,
          label: i18nT('common:core.module.input.label.Response content'),
          description: i18nT('common:core.module.input.description.Response content'),
          placeholder: i18nT('common:core.module.input.description.Response content'),
          value: ['VARIABLE_NODE_ID', 'byG7WNk4'],
          selectedTypeIndex: 1
        }
      ],
      outputs: []
    };
  }

  function createAssistantAiChatNode(
    formData: AppSimpleEditFormType,
    nodeId: string,
    position: { x: number; y: number }
  ): StoreNodeItemType {
    // 复用现有的 aiChatTemplate，只覆盖特定的配置
    const baseAiChatNode = aiChatTemplate(formData);

    return {
      ...baseAiChatNode,
      nodeId,
      position,
      // 覆盖特定的输入配置
      inputs: baseAiChatNode.inputs.map((input) => {
        // 更新历史记录的最大值为50（assistant模式）
        if (input.key === NodeInputKeyEnum.history) {
          return {
            ...input,
            max: 50,
            description: i18nT('workflow:max_dialog_rounds')
          };
        }
        // 更新用户问题输入的标签和描述
        if (input.key === NodeInputKeyEnum.userChatInput) {
          return {
            ...input,
            label: i18nT('workflow:user_question'),
            toolDescription: i18nT('workflow:user_question_tool_desc')
          };
        }
        // 更新文件输入的键名和配置
        if (input.key === NodeInputKeyEnum.aiChatDatasetQuote) {
          return {
            ...input,
            key: 'quoteQA',
            value: [datasetNodeId, 'quoteQA']
          };
        }
        // 更新文件链接输入
        if (input.key === 'fileUrlList') {
          return {
            ...input,
            value: [[workflowStartNodeId, 'userFiles']]
          };
        }
        return input;
      }),
      // 添加额外的输出
      outputs: [
        ...baseAiChatNode.outputs,
        {
          id: 'reasoningText',
          key: 'reasoningText',
          required: false,
          label: i18nT('workflow:reasoning_text'),
          valueType: WorkflowIOValueTypeEnum.string,
          type: FlowNodeOutputTypeEnum.static
        },
        {
          id: 'system_error_text',
          key: 'system_error_text',
          type: FlowNodeOutputTypeEnum.error,
          valueType: WorkflowIOValueTypeEnum.string,
          label: i18nT('workflow:error_text')
        }
      ],
      catchError: false
    };
  }

  function assistantTemplate(formData: AppSimpleEditFormType): WorkflowType {
    const nodeIds = {
      variableUpdate: 'variableUpdateNodeId',
      conditionChecker: 'qaFDoVSH4WcXMZPO',
      fallbackReply: 'vprtN0xvK1dV0c6M',
      aiChat: aiChatNodeId,
      correctionChecker: 'lb9O8Jqhq5RMomsX',
      correctionReply: 'm8xjpNzwcx2yE3Ar',
      replyModeChecker: 'vjq2vUcq4Tmxiu0z',
      faqChecker: 'yv0uRQ4kOeVbaQ6i',
      faqReply: 'v2hbYrBvxfBKTG7s'
    };

    // 创建校正数据检查节点
    function createCorrectionCheckerNode(
      nodeId: string,
      position: { x: number; y: number }
    ): StoreNodeItemType {
      return {
        nodeId,
        name: i18nT('workflow:correction_data_hit_check'),
        intro: i18nT('workflow:execute_different_branches_based_on_conditions'),
        avatar: 'core/workflow/template/ifelse',
        flowNodeType: FlowNodeTypeEnum.ifElseNode,
        showStatus: true,
        position,
        version: '481',
        inputs: [
          {
            key: 'ifElseList',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: [
              {
                condition: 'AND',
                list: [
                  {
                    variable: ['VARIABLE_NODE_ID', 'hTRJXdb1'],
                    condition: 'isNotEmpty',
                    valueType: 'input'
                  }
                ]
              }
            ]
          }
        ],
        outputs: [
          {
            id: 'ifElseResult',
            key: 'ifElseResult',
            label: 'workflow:judgment_result',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      };
    }

    // 创建校正数据回复节点
    function createCorrectionReplyNode(
      nodeId: string,
      position: { x: number; y: number }
    ): StoreNodeItemType {
      return {
        nodeId,
        name: i18nT('workflow:use_correction_data_reply'),
        intro: i18nT('workflow:intro_assigned_reply'),
        avatar: 'core/workflow/template/reply',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        position,
        version: '481',
        inputs: [
          {
            key: 'text',
            renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.any,
            required: true,
            label: i18nT('common:core.module.input.label.Response content'),
            description: i18nT('common:core.module.input.description.Response content'),
            placeholder: i18nT('common:core.module.input.description.Response content'),
            value: ['VARIABLE_NODE_ID', 'hTRJXdb1'],
            selectedTypeIndex: 1
          }
        ],
        outputs: []
      };
    }

    // 更新变量更新节点，添加校正数据变量
    function createUpdatedVariableUpdateNode(
      nodeId: string,
      position: { x: number; y: number },
      formData: AppSimpleEditFormType
    ): StoreNodeItemType {
      return {
        nodeId,
        name: i18nT('app:smart_customer_service_qa_config'),
        avatar: 'core/workflow/template/variableUpdate',
        flowNodeType: FlowNodeTypeEnum.variableUpdate,
        showStatus: false,
        position,
        inputs: [
          {
            key: 'updateList',
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value: [
              {
                variable: ['VARIABLE_NODE_ID', 'byG7WNk4'],
                value: [
                  '',
                  formData.chatConfig.fallbackReply ||
                    i18nT('workflow:customer_service.fallback_reply_default')
                ],
                valueType: 'string',
                renderType: 'input'
              },
              {
                variable: ['VARIABLE_NODE_ID', 'utjZSg8f'],
                value: ['', formData.chatConfig.faqAnswerMode || 'quote'],
                renderType: 'input',
                valueType: 'string'
              },
              {
                variable: ['VARIABLE_NODE_ID', 'hTRJXdb1'],
                value: ['', ''],
                renderType: 'input',
                valueType: 'string'
              },
              {
                variable: ['VARIABLE_NODE_ID', 'udQRlgfO'],
                value: ['', ''],
                renderType: 'input',
                valueType: 'string'
              }
            ]
          }
        ],
        outputs: []
      };
    }

    formData.dataset.datasetSearchExtensionModel = formData.aiSettings.model;

    // 创建回复模式判断节点
    function createReplyModeCheckerNode(
      nodeId: string,
      position: { x: number; y: number }
    ): StoreNodeItemType {
      return {
        nodeId,
        name: i18nT('common:reply_mode_checker_node_name'),
        intro: i18nT('common:execute_different_branches_based_on_conditions'),
        avatar: 'core/workflow/template/ifelse',
        flowNodeType: FlowNodeTypeEnum.ifElseNode,
        showStatus: true,
        position,
        version: '481',
        inputs: [
          {
            key: 'ifElseList',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: [
              {
                condition: 'AND',
                list: [
                  {
                    variable: ['VARIABLE_NODE_ID', 'utjZSg8f'],
                    condition: 'equalTo',
                    value: 'llm-summary',
                    valueType: 'input'
                  }
                ]
              }
            ]
          }
        ],
        outputs: [
          {
            id: 'ifElseResult',
            key: 'ifElseResult',
            label: i18nT('workflow:judgment_result'),
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      };
    }

    // 创建FAQ命中检查节点
    function createFaqCheckerNode(
      nodeId: string,
      position: { x: number; y: number }
    ): StoreNodeItemType {
      return {
        nodeId,
        name: i18nT('common:faq_checker_node_name'),
        intro: i18nT('common:execute_different_branches_based_on_conditions'),
        avatar: 'core/workflow/template/ifelse',
        flowNodeType: FlowNodeTypeEnum.ifElseNode,
        showStatus: true,
        position,
        version: '481',
        inputs: [
          {
            key: 'ifElseList',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: [
              {
                condition: 'AND',
                list: [
                  {
                    variable: ['VARIABLE_NODE_ID', 'udQRlgfO'],
                    condition: 'isNotEmpty',
                    valueType: 'input'
                  }
                ]
              }
            ]
          }
        ],
        outputs: [
          {
            id: 'ifElseResult',
            key: 'ifElseResult',
            label: i18nT('workflow:judgment_result'),
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      };
    }

    // 创建FAQ回复节点
    function createFaqReplyNode(
      nodeId: string,
      position: { x: number; y: number }
    ): StoreNodeItemType {
      return {
        nodeId,
        name: i18nT('common:use_faq_data_reply'),
        intro: i18nT('common:faq_reply_node_intro'),
        avatar: 'core/workflow/template/reply',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        position,
        version: '481',
        inputs: [
          {
            key: 'text',
            renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.any,
            required: true,
            label: i18nT('common:core.module.input.label.Response content'),
            description: i18nT('common:core.module.input.description.Response content'),
            placeholder: i18nT('common:core.module.input.description.Response content'),
            value: ['VARIABLE_NODE_ID', 'udQRlgfO'],
            selectedTypeIndex: 1
          }
        ],
        outputs: []
      };
    }

    const nodes = [
      createUpdatedVariableUpdateNode(
        nodeIds.variableUpdate,
        {
          x: 494.7192302293264,
          y: -1212.140341718712
        },
        formData
      ),
      datasetNodeTemplate(formData, [workflowStartNodeId, 'userChatInput']),
      createConditionCheckerNode(nodeIds.conditionChecker, {
        x: 1846.7192302293263,
        y: -1185.140341718712
      }),
      createFallbackReplyNode(nodeIds.fallbackReply, {
        x: 2709.2192302293265,
        y: -1297.390341718712
      }),
      createAssistantAiChatNode(formData, nodeIds.aiChat, {
        x: 3591.7192302293265,
        y: -1632.140341718712
      }),
      createCorrectionCheckerNode(nodeIds.correctionChecker, {
        x: 2683.7192302293265,
        y: -994.3903417187121
      }),
      createCorrectionReplyNode(nodeIds.correctionReply, {
        x: 3520.7192302293265,
        y: -576.1403417187121
      }),
      createReplyModeCheckerNode(nodeIds.replyModeChecker, {
        x: 3520.7192302293265,
        y: -1283.390341718712
      }),
      createFaqCheckerNode(nodeIds.faqChecker, {
        x: 4357.719230229326,
        y: -442.3903417187121
      }),
      createFaqReplyNode(nodeIds.faqReply, {
        x: 5194.719230229326,
        y: -353.8903417187121
      })
    ];

    const edges = [
      {
        source: workflowStartNodeId,
        target: nodeIds.variableUpdate,
        sourceHandle: `${workflowStartNodeId}-source-right`,
        targetHandle: `${nodeIds.variableUpdate}-target-left`
      },
      {
        source: nodeIds.variableUpdate,
        target: datasetNodeId,
        sourceHandle: `${nodeIds.variableUpdate}-source-right`,
        targetHandle: `${datasetNodeId}-target-left`
      },
      {
        source: datasetNodeId,
        target: nodeIds.conditionChecker,
        sourceHandle: `${datasetNodeId}-source-right`,
        targetHandle: `${nodeIds.conditionChecker}-target-left`
      },
      {
        source: nodeIds.conditionChecker,
        target: nodeIds.fallbackReply,
        sourceHandle: `${nodeIds.conditionChecker}-source-IF`,
        targetHandle: `${nodeIds.fallbackReply}-target-left`
      },
      {
        source: nodeIds.conditionChecker,
        target: nodeIds.replyModeChecker,
        sourceHandle: `${nodeIds.conditionChecker}-source-ELSE`,
        targetHandle: `${nodeIds.replyModeChecker}-target-left`
      },
      {
        source: nodeIds.replyModeChecker,
        target: nodeIds.correctionChecker,
        sourceHandle: `${nodeIds.replyModeChecker}-source-IF`,
        targetHandle: `${nodeIds.correctionChecker}-target-left`
      },
      {
        source: nodeIds.replyModeChecker,
        target: nodeIds.faqChecker,
        sourceHandle: `${nodeIds.replyModeChecker}-source-ELSE`,
        targetHandle: `${nodeIds.faqChecker}-target-left`
      },
      {
        source: nodeIds.faqChecker,
        target: nodeIds.faqReply,
        sourceHandle: `${nodeIds.faqChecker}-source-IF`,
        targetHandle: `${nodeIds.faqReply}-target-left`
      },
      {
        source: nodeIds.faqChecker,
        target: nodeIds.correctionChecker,
        sourceHandle: `${nodeIds.faqChecker}-source-ELSE`,
        targetHandle: `${nodeIds.correctionChecker}-target-left`
      },
      {
        source: nodeIds.correctionChecker,
        target: nodeIds.aiChat,
        sourceHandle: `${nodeIds.correctionChecker}-source-ELSE`,
        targetHandle: `${nodeIds.aiChat}-target-left`
      },
      {
        source: nodeIds.correctionChecker,
        target: nodeIds.correctionReply,
        sourceHandle: `${nodeIds.correctionChecker}-source-IF`,
        targetHandle: `${nodeIds.correctionReply}-target-left`
      }
    ];

    return {
      nodes,
      edges
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
          name: AgentNode.name,
          intro: AgentNode.intro,
          avatar: AgentNode.avatar,
          flowNodeType: AgentNode.flowNodeType,
          showStatus: true,
          position: {
            x: 1062.1738942532802,
            y: -223.65033022650476
          },
          version: AgentNode.version,
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
          outputs: AgentNode.outputs
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
    if (appType === AppTypeEnum.assistant) {
      return assistantTemplate(data);
    }
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
