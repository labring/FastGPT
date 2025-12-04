import { parseCurl } from '@fastgpt/global/common/string/http';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import {
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum,
  VariableInputEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { i18nT } from '@fastgpt/web/i18n/utils';

export const emptyTemplates: Record<
  AppTypeEnum.simple | AppTypeEnum.plugin | AppTypeEnum.workflow | AppTypeEnum.assistant,
  {
    name: string;
    avatar: string;
    nodes: AppSchema['modules'];
    edges: AppSchema['edges'];
    chatConfig: AppSchema['chatConfig'];
  }
> = {
  [AppTypeEnum.simple]: {
    avatar: 'core/workflow/template/aiChat',
    name: i18nT('app:template.simple_robot'),
    nodes: [
      {
        nodeId: 'userGuide',
        name: i18nT('common:core.module.template.system_config'),
        intro: i18nT('common:core.module.template.config_params'),
        avatar: 'core/workflow/template/systemConfig',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        position: {
          x: 531.2422736065552,
          y: -486.7611729549753
        },
        version: '481',
        inputs: [
          {
            key: 'welcomeText',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'core.app.Welcome Text',
            value: ''
          },
          {
            key: 'variables',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: 'core.app.Chat Variable',
            value: []
          },
          {
            key: 'questionGuide',
            valueType: WorkflowIOValueTypeEnum.object,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: {
              open: false
            }
          },
          {
            key: 'tts',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: {
              type: 'web'
            }
          },
          {
            key: 'whisper',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: {
              open: false,
              autoSend: false,
              autoTTSResponse: false
            }
          },
          {
            key: 'scheduleTrigger',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: null
          }
        ],
        outputs: []
      },
      {
        nodeId: '448745',
        name: i18nT('common:core.module.template.work_start'),
        intro: '',
        avatar: 'core/workflow/template/workflowStart',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        position: {
          x: 558.4082376415505,
          y: 123.72387429194112
        },
        version: '481',
        inputs: [
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: i18nT('common:core.module.input.label.user question'),
            required: true,
            toolDescription: i18nT('common:core.module.input.label.user question')
          }
        ],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      },
      {
        nodeId: 'loOvhld2ZTKa',
        name: i18nT('common:core.module.template.ai_chat'),
        intro: i18nT('common:core.module.template.ai_chat_intro'),
        avatar: 'core/workflow/template/aiChat',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        showStatus: true,
        position: {
          x: 1097.7317280958762,
          y: -244.16014496351386
        },
        version: '481',
        inputs: [
          {
            key: 'model',
            renderTypeList: [
              FlowNodeInputTypeEnum.settingLLMModel,
              FlowNodeInputTypeEnum.reference
            ],
            label: 'core.module.input.label.aiModel',
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            key: 'temperature',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: undefined,
            valueType: WorkflowIOValueTypeEnum.number,
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: undefined,
            valueType: WorkflowIOValueTypeEnum.number,
            min: 100,
            max: 4000,
            step: 50
          },
          {
            key: 'isResponseAnswerText',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: true,
            valueType: WorkflowIOValueTypeEnum.boolean
          },
          {
            key: 'quoteTemplate',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            key: 'quotePrompt',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            key: 'systemPrompt',
            renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
            max: 3000,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'core.ai.Prompt',
            description: 'core.app.tip.systemPromptTip',
            placeholder: 'core.app.tip.chatNodeSystemPromptTip',
            value: ''
          },
          {
            key: 'history',
            renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.chatHistory,
            label: 'core.module.input.label.chat history',
            required: true,
            min: 0,
            max: 30,
            value: 6
          },
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: i18nT('common:core.module.input.label.user question'),
            required: true,
            toolDescription: i18nT('common:core.module.input.label.user question'),
            value: ['448745', 'userChatInput']
          },
          {
            key: 'quoteQA',
            renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
            label: '',
            debugLabel: i18nT('common:core.module.Dataset quote.label'),
            description: '',
            valueType: WorkflowIOValueTypeEnum.datasetQuote
          },
          {
            key: NodeInputKeyEnum.aiChatReasoning,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: true
          }
        ],
        outputs: [
          {
            id: 'history',
            key: 'history',
            label: 'core.module.output.label.New context',
            description: 'core.module.output.description.New context',
            valueType: WorkflowIOValueTypeEnum.chatHistory,
            type: FlowNodeOutputTypeEnum.static
          },
          {
            id: 'answerText',
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      }
    ],
    edges: [
      {
        source: '448745',
        target: 'loOvhld2ZTKa',
        sourceHandle: '448745-source-right',
        targetHandle: 'loOvhld2ZTKa-target-left'
      }
    ],
    chatConfig: {}
  },
  [AppTypeEnum.workflow]: {
    avatar: 'core/app/type/workflowFill',
    name: i18nT('common:core.module.template.empty_workflow'),
    nodes: [
      {
        nodeId: 'userGuide',
        name: i18nT('common:core.module.template.system_config'),
        intro: i18nT('common:core.module.template.system_config_info'),
        avatar: 'core/workflow/template/systemConfig',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        position: {
          x: 262.2732338817093,
          y: -476.00241136598146
        },
        version: '481',
        inputs: [
          {
            key: 'welcomeText',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'core.app.Welcome Text',
            value: ''
          },
          {
            key: 'variables',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: 'core.app.Chat Variable',
            value: []
          },
          {
            key: 'questionGuide',
            valueType: WorkflowIOValueTypeEnum.any,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: {
              open: false
            }
          },
          {
            key: 'tts',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: {
              type: 'web'
            }
          },
          {
            key: 'whisper',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: {
              open: false,
              autoSend: false,
              autoTTSResponse: false
            }
          },
          {
            key: 'scheduleTrigger',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: null
          }
        ],
        outputs: []
      },
      {
        nodeId: '448745',
        name: i18nT('common:core.module.template.work_start'),
        intro: '',
        avatar: 'core/workflow/template/workflowStart',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        position: {
          x: 632.368838596004,
          y: -347.7446492944009
        },
        version: '481',
        inputs: [
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: i18nT('common:core.module.input.label.user question'),
            required: true,
            toolDescription: i18nT('common:core.module.input.label.user question')
          }
        ],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            label: 'common:core.module.input.label.user question',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    ],
    edges: [],
    chatConfig: {}
  },
  [AppTypeEnum.plugin]: {
    avatar: 'core/app/type/pluginFill',
    name: i18nT('common:core.module.template.empty_plugin'),
    nodes: [
      {
        nodeId: 'pluginInput',
        name: i18nT('workflow:template.plugin_start'),
        avatar: 'core/workflow/template/workflowStart',
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        showStatus: false,
        position: {
          x: 616.4226348688949,
          y: -165.05298493910115
        },
        version: '481',
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'pluginOutput',
        name: i18nT('common:core.module.template.self_output'),
        avatar: '/imgs/workflow/output.png',
        flowNodeType: FlowNodeTypeEnum.pluginOutput,
        showStatus: false,
        position: {
          x: 1607.7142331269126,
          y: -151.8669210746189
        },
        version: '481',
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'pluginConfig',
        name: i18nT('common:core.module.template.system_config'),
        intro: '',
        avatar: 'core/workflow/template/systemConfig',
        flowNodeType: FlowNodeTypeEnum.pluginConfig,
        position: {
          x: 184.66337662472682,
          y: -216.05298493910115
        },
        version: '4811',
        inputs: [],
        outputs: []
      }
    ],
    edges: [],
    chatConfig: {}
  },
  [AppTypeEnum.assistant]: {
    avatar: 'core/workflow/template/customerService',
    name: i18nT('app:template.customer_service_assistant'),
    nodes: [
      {
        nodeId: 'userGuide',
        name: i18nT('common:core.module.template.system_config'),
        intro: i18nT('common:core.module.template.system_config_info'),
        avatar: 'core/workflow/template/systemConfig',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        position: {
          x: -83.21188516590976,
          y: -455.6131256516957
        },
        version: '481',
        inputs: [
          {
            key: 'welcomeText',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'core.app.Welcome Text',
            value: ''
          },
          {
            key: 'variables',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: 'core.app.Chat Variable',
            value: []
          },
          {
            key: 'questionGuide',
            valueType: WorkflowIOValueTypeEnum.object,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: {
              open: false
            }
          },
          {
            key: 'tts',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: {
              type: 'web'
            }
          },
          {
            key: 'whisper',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: {
              open: false,
              autoSend: false,
              autoTTSResponse: false
            }
          },
          {
            key: 'scheduleTrigger',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: null
          }
        ],
        outputs: []
      },
      {
        nodeId: '448745',
        name: i18nT('common:core.module.template.work_start'),
        intro: '',
        avatar: 'core/workflow/template/workflowStart',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        position: {
          x: 481.30634687244265,
          y: -501.97057002072324
        },
        version: '481',
        inputs: [
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: i18nT('workflow:user_question'),
            required: true,
            toolDescription: i18nT('workflow:user_question_tool_desc'),
            debugLabel: ''
          }
        ],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            label: 'common:core.module.input.label.user question',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.string,
            description: ''
          }
        ]
      },
      {
        nodeId: 'oVI9tI9mvGVv7BF4',
        name: i18nT('workflow:customer_service.dataset_search_node_name'),
        intro: i18nT('workflow:template.dataset_search_intro'),
        avatar: 'core/workflow/template/datasetSearch',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        showStatus: true,
        position: {
          x: 1181.4000948777586,
          y: -1041.7929020914667
        },
        version: '4.9.2',
        inputs: [
          {
            key: 'datasets',
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            label: 'common:core.module.input.label.Select dataset',
            value: [],
            valueType: WorkflowIOValueTypeEnum.selectDataset,
            required: true,
            valueDesc: '{\n  datasetId: string;\n}[]',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'similarity',
            renderTypeList: [FlowNodeInputTypeEnum.selectDatasetParamsModal],
            label: '',
            value: 0.4,
            valueType: WorkflowIOValueTypeEnum.number,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'limit',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 5000,
            valueType: WorkflowIOValueTypeEnum.number,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'searchMode',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'mixedRecall',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'embeddingWeight',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.number,
            value: 0.65,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'usingReRank',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: true,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'rerankModel',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            debugLabel: '',
            toolDescription: '',
            value: 'bge-reranker-large'
          },
          {
            key: 'rerankMethod',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'content',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'rerankWeight',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.number,
            value: 0.4,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'datasetSearchUsingExtensionQuery',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: true,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'datasetSearchExtensionModel',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            debugLabel: '',
            toolDescription: '',
            value: ''
          },
          {
            key: 'datasetSearchExtensionBg',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            value: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'authTmbId',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: false,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: i18nT('workflow:user_question'),
            toolDescription: i18nT('workflow:customer_service.search_content_desc'),
            required: true,
            value: ['448745', 'userChatInput'],
            debugLabel: ''
          },
          {
            key: 'collectionFilterMatch',
            renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
            label: 'workflow:collection_metadata_filter',
            valueType: WorkflowIOValueTypeEnum.string,
            isPro: true,
            description: 'workflow:filter_description',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'generateSqlModel',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'common:search_model',
            value: '',
            valueType: WorkflowIOValueTypeEnum.string,
            debugLabel: '',
            toolDescription: ''
          }
        ],
        outputs: [
          {
            id: 'quoteQA',
            key: 'quoteQA',
            label: 'common:core.module.Dataset quote.label',
            description: 'workflow:special_array_format',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.datasetQuote,
            valueDesc:
              '{\n  id: string;\n  datasetId: string;\n  collectionId: string;\n  sourceName: string;\n  sourceId?: string;\n  q: string;\n  a: string\n}[]'
          },
          {
            id: 'system_error_text',
            key: 'system_error_text',
            type: FlowNodeOutputTypeEnum.error,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'workflow:error_text',
            valueDesc: '',
            description: ''
          }
        ],
        catchError: false
      },
      {
        nodeId: 'qaFDoVSH4WcXMZPO',
        name: i18nT('workflow:condition_checker'),
        intro: i18nT('workflow:execute_different_branches_based_on_conditions'),
        avatar: 'core/workflow/template/ifelse',
        flowNodeType: FlowNodeTypeEnum.ifElseNode,
        showStatus: true,
        position: {
          x: 2277.985028019776,
          y: -1299.563387920271
        },
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
                    variable: ['oVI9tI9mvGVv7BF4', 'quoteQA'],
                    condition: 'isEmpty',
                    valueType: 'input'
                  }
                ]
              }
            ],
            debugLabel: '',
            toolDescription: ''
          }
        ],
        outputs: [
          {
            id: 'ifElseResult',
            key: 'ifElseResult',
            label: 'workflow:judgment_result',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static,
            valueDesc: '',
            description: ''
          }
        ]
      },
      {
        nodeId: 'vprtN0xvK1dV0c6M',
        name: i18nT('workflow:assigned_reply'),
        intro: i18nT('workflow:intro_assigned_reply'),
        avatar: 'core/workflow/template/reply',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        position: {
          x: 3281.4085684466586,
          y: -1344.9921952365255
        },
        inputs: [
          {
            key: 'text',
            renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.any,
            required: true,
            label: 'common:core.module.input.label.Response content',
            description: 'common:core.module.input.description.Response content',
            placeholder: 'common:core.module.input.description.Response content',
            value: ['VARIABLE_NODE_ID', 'byG7WNk4'],
            selectedTypeIndex: 1,
            debugLabel: '',
            toolDescription: ''
          }
        ],
        outputs: []
      },
      {
        nodeId: 'zPMaGZJTcmh6qjx2',
        name: i18nT('workflow:customer_service.checker_node_name'),
        intro: i18nT('workflow:execute_different_branches_based_on_conditions'),
        avatar: 'core/workflow/template/ifelse',
        flowNodeType: FlowNodeTypeEnum.ifElseNode,
        showStatus: true,
        position: {
          x: 3067.066917987494,
          y: -837.539310501848
        },
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
            ],
            debugLabel: '',
            toolDescription: ''
          }
        ],
        outputs: [
          {
            id: 'ifElseResult',
            key: 'ifElseResult',
            label: 'workflow:judgment_result',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static,
            valueDesc: '',
            description: ''
          }
        ]
      },
      {
        nodeId: 'v3bQOzJhRAvDPPKG',
        name: i18nT('common:core.module.template.ai_chat'),
        intro: i18nT('common:core.module.template.ai_chat_intro'),
        avatar: 'core/workflow/template/aiChat',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        showStatus: true,
        position: {
          x: 4430.42738186963,
          y: -837.539310501848
        },
        version: '4.9.7',
        inputs: [
          {
            key: 'model',
            renderTypeList: [
              FlowNodeInputTypeEnum.settingLLMModel,
              FlowNodeInputTypeEnum.reference
            ],
            label: 'common:core.module.input.label.aiModel',
            valueType: WorkflowIOValueTypeEnum.string,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'temperature',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.number,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'maxToken',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.number,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'isResponseAnswerText',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: true,
            valueType: WorkflowIOValueTypeEnum.boolean,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'aiChatQuoteRole',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'system',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'quoteTemplate',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'quotePrompt',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'aiChatVision',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: true,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: NodeInputKeyEnum.aiChatReasoning,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: true,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'aiChatTopP',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.number,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'aiChatStopSign',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'aiChatResponseFormat',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'aiChatJsonSchema',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'systemPrompt',
            renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
            max: 3000,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'common:core.ai.Prompt',
            description: 'common:core.app.tip.systemPromptTip',
            placeholder: 'common:core.app.tip.chatNodeSystemPromptTip',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'history',
            renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.chatHistory,
            label: 'common:core.module.input.label.chat history',
            description: 'workflow:max_dialog_rounds',
            required: true,
            min: 0,
            max: 50,
            value: 6,
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'quoteQA',
            renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
            label: '',
            debugLabel: i18nT('common:core.module.Dataset quote.label'),
            valueType: WorkflowIOValueTypeEnum.datasetQuote,
            value: ['oVI9tI9mvGVv7BF4', 'quoteQA'],
            description: '',
            toolDescription: ''
          },
          {
            key: 'fileUrlList',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
            label: 'app:workflow.user_file_input',
            debugLabel: i18nT('workflow:customer_service.file_link_label'),
            description: 'app:workflow.user_file_input_desc',
            valueType: WorkflowIOValueTypeEnum.arrayString,
            value: [['448745', 'userFiles']],
            toolDescription: ''
          },
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: i18nT('workflow:user_question'),
            toolDescription: i18nT('workflow:user_question_tool_desc'),
            required: true,
            value: ['448745', 'userChatInput'],
            debugLabel: ''
          }
        ],
        outputs: [
          {
            id: 'history',
            key: 'history',
            required: true,
            label: 'common:core.module.output.label.New context',
            description: 'common:core.module.output.description.New context',
            valueType: WorkflowIOValueTypeEnum.chatHistory,
            valueDesc: '{\n  obj: System | Human | AI;\n  value: string;\n}[]',
            type: FlowNodeOutputTypeEnum.static
          },
          {
            id: 'answerText',
            key: 'answerText',
            required: true,
            label: 'common:core.module.output.label.Ai response content',
            description: 'common:core.module.output.description.Ai response content',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static,
            valueDesc: ''
          },
          {
            id: 'reasoningText',
            key: 'reasoningText',
            required: false,
            label: 'workflow:reasoning_text',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static,
            invalid: false,
            valueDesc: '',
            description: ''
          },
          {
            id: 'system_error_text',
            key: 'system_error_text',
            type: FlowNodeOutputTypeEnum.error,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'workflow:error_text',
            valueDesc: '',
            description: ''
          }
        ],
        catchError: false
      }
    ],
    edges: [
      {
        source: '448745',
        target: 'oVI9tI9mvGVv7BF4',
        sourceHandle: '448745-source-right',
        targetHandle: 'oVI9tI9mvGVv7BF4-target-left'
      },
      {
        source: 'oVI9tI9mvGVv7BF4',
        target: 'qaFDoVSH4WcXMZPO',
        sourceHandle: 'oVI9tI9mvGVv7BF4-source-right',
        targetHandle: 'qaFDoVSH4WcXMZPO-target-left'
      },
      {
        source: 'qaFDoVSH4WcXMZPO',
        target: 'vprtN0xvK1dV0c6M',
        sourceHandle: 'qaFDoVSH4WcXMZPO-source-IF',
        targetHandle: 'vprtN0xvK1dV0c6M-target-left'
      },
      {
        source: 'qaFDoVSH4WcXMZPO',
        target: 'zPMaGZJTcmh6qjx2',
        sourceHandle: 'qaFDoVSH4WcXMZPO-source-ELSE',
        targetHandle: 'zPMaGZJTcmh6qjx2-target-left'
      },
      {
        source: 'zPMaGZJTcmh6qjx2',
        target: 'v3bQOzJhRAvDPPKG',
        sourceHandle: 'zPMaGZJTcmh6qjx2-source-IF',
        targetHandle: 'v3bQOzJhRAvDPPKG-target-left'
      }
    ],
    chatConfig: {
      variables: [
        {
          key: 'byG7WNk4',
          label: 'fallbackReply',
          type: VariableInputEnum.textarea,
          description: i18nT('workflow:customer_service.fallback_reply_desc'),
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          defaultValue: i18nT('workflow:customer_service.fallback_reply_default'),
          maxLength: 4000
        },
        {
          key: 'utjZSg8f',
          label: 'faqAnswerMode',
          type: VariableInputEnum.select,
          description: i18nT('workflow:customer_service.answer_mode_desc'),
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          list: [
            {
              value: 'quote',
              label: i18nT('workflow:customer_service.answer_mode_quote')
            },
            {
              label: i18nT('workflow:customer_service.answer_mode_summary'),
              value: 'llm-summary'
            }
          ],
          defaultValue: 'quote'
        }
      ],
      scheduledTriggerConfig: {
        cronString: '',
        timezone: 'Asia/Shanghai',
        defaultPrompt: ''
      },
      welcomeText: i18nT('workflow:customer_service.welcome_text_default')
    }
  }
};

export const parsePluginFromCurlString = (
  curl: string
): {
  nodes: AppSchema['modules'];
  edges: AppSchema['edges'];
  chatConfig: AppSchema['chatConfig'];
} => {
  const { url, method, headers, body, params, bodyArray } = parseCurl(curl);

  const allInputs = Array.from(
    new Map([...params, ...bodyArray].map((item) => [item.key, item])).values()
  );
  const formatPluginStartInputs = allInputs
    .map((item) => {
      const valueType = item.value === null ? 'string' : typeof item.value;
      const valueTypeMap = {
        string: {
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.string,
          isToolType: true,
          defaultValue: item.value
        },
        number: {
          renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.number,
          isToolType: true,
          defaultValue: item.value
        },
        boolean: {
          renderTypeList: [FlowNodeInputTypeEnum.switch, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.boolean,
          isToolType: true,
          defaultValue: item.value
        },
        object: {
          renderTypeList: [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.object,
          isToolType: false,
          defaultValue: ''
        }
      };

      const valueTypeItem = valueTypeMap[valueType as keyof typeof valueTypeMap];
      if (!valueTypeItem) return;

      return {
        renderTypeList: valueTypeItem.renderTypeList,
        selectedTypeIndex: 0,
        valueType: valueTypeItem.valueType,
        canEdit: true,
        key: item.key,
        label: item.key,
        description: '',
        defaultValue: valueTypeItem.defaultValue,
        required: false,
        toolDescription: valueTypeItem.isToolType ? item.key : ''
      };
    })
    .filter(Boolean) as FlowNodeInputItemType[];
  const formatPluginStartOutputs = formatPluginStartInputs.map<FlowNodeOutputItemType>((item) => ({
    id: item.key,
    key: item.key,
    label: item.key,
    valueType: item.valueType,
    type: FlowNodeOutputTypeEnum.hidden
  }));

  const referenceHeaders = headers.map((item) => ({
    key: item.key,
    value: item.value,
    type: item.type
  }));
  const referenceParams = params.map((item) => ({
    key: item.key,
    value: `{{$pluginInput.${item.key}$}}`,
    type: item.type
  }));
  const referenceBody = Object.entries(JSON.parse(body)).reduce(
    (acc, [key, value]) => {
      acc[key] =
        typeof value === 'string' ? `###{{$pluginInput.${key}$}}###` : `{{$pluginInput.${key}$}}`;
      return acc;
    },
    {} as Record<string, any>
  );
  const referenceBodyStr = JSON.stringify(referenceBody, null, 2)
    .replace(/"{{\$/g, '{{$')
    .replace(/\$}}"/g, '$}}')
    .replace(/###{{\$/g, '{{$')
    .replace(/\$}}###/g, '$}}');

  return {
    nodes: [
      {
        nodeId: 'pluginInput',
        name: i18nT('workflow:template.plugin_start'),
        intro: i18nT('workflow:intro_plugin_input'),
        avatar: 'core/workflow/template/workflowStart',
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        showStatus: false,
        position: {
          x: 427.6554681270263,
          y: -291.6987155252725
        },
        version: '481',
        inputs: formatPluginStartInputs,
        outputs: formatPluginStartOutputs
      },
      {
        nodeId: 'pluginOutput',
        name: i18nT('common:core.module.template.self_output'),
        intro: i18nT('workflow:intro_custom_plugin_output'),
        avatar: 'core/workflow/template/pluginOutput',
        flowNodeType: FlowNodeTypeEnum.pluginOutput,
        showStatus: false,
        position: {
          x: 1870.1072210870427,
          y: -126.69871552527252
        },
        version: '481',
        inputs: [
          {
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.any,
            canEdit: true,
            key: 'result',
            label: 'result',
            isToolOutput: true,
            description: '',
            required: true,
            value: ['vumlECDQTjeC', 'httpRawResponse']
          },
          {
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.object,
            canEdit: true,
            key: 'error',
            label: 'error',
            isToolOutput: true,
            description: '',
            required: true,
            value: ['vumlECDQTjeC', 'error']
          }
        ],
        outputs: []
      },
      {
        nodeId: 'vumlECDQTjeC',
        name: 'HTTP 请求',
        intro: '可以发出一个 HTTP 请求，实现更为复杂的操作（联网搜索、数据库查询等）',
        avatar: 'core/workflow/template/httpRequest',
        flowNodeType: FlowNodeTypeEnum.httpRequest468,
        showStatus: true,
        position: {
          x: 1049.4419012643668,
          y: -471.49748139163944
        },
        version: '481',
        inputs: [
          {
            key: 'system_addInputParam',
            renderTypeList: [FlowNodeInputTypeEnum.addInputParam],
            valueType: WorkflowIOValueTypeEnum.dynamic,
            label: '',
            required: false,
            description: '接收前方节点的输出值作为变量，这些变量可以被 HTTP 请求参数使用。',
            customInputConfig: {
              selectValueTypeList: [
                WorkflowIOValueTypeEnum.string,
                WorkflowIOValueTypeEnum.number,
                WorkflowIOValueTypeEnum.boolean,
                WorkflowIOValueTypeEnum.object,
                WorkflowIOValueTypeEnum.arrayString,
                WorkflowIOValueTypeEnum.arrayNumber,
                WorkflowIOValueTypeEnum.arrayBoolean,
                WorkflowIOValueTypeEnum.arrayObject,
                WorkflowIOValueTypeEnum.arrayAny,
                WorkflowIOValueTypeEnum.any,
                WorkflowIOValueTypeEnum.chatHistory,
                WorkflowIOValueTypeEnum.datasetQuote,
                WorkflowIOValueTypeEnum.dynamic,
                WorkflowIOValueTypeEnum.selectApp,
                WorkflowIOValueTypeEnum.selectDataset
              ],
              showDescription: false,
              showDefaultValue: true
            },
            valueDesc: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpMethod',
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            valueType: WorkflowIOValueTypeEnum.string,
            label: '',
            value: method,
            required: true,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpTimeout',
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            valueType: WorkflowIOValueTypeEnum.number,
            label: '',
            value: 30,
            min: 5,
            max: 600,
            required: true,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpReqUrl',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            label: '',
            description:
              '新的 HTTP 请求地址。如果出现两个"请求地址"，可以删除该模块重新加入，会拉取最新的模块配置。',
            placeholder: 'https://api.ai.com/getInventory',
            required: false,
            value: url,
            valueDesc: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpHeader',
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            valueType: WorkflowIOValueTypeEnum.any,
            value: referenceHeaders,
            label: '',
            description:
              '自定义请求头，请严格填入 JSON 字符串。\n1. 确保最后一个属性没有逗号\n2. 确保 key 包含双引号\n例如：{"Authorization":"Bearer xxx"}',
            placeholder: 'common:core.module.input.description.Http Request Header',
            required: false,
            valueDesc: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpParams',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            value: referenceParams,
            description:
              '新的 HTTP 请求地址。如果出现两个“请求地址”，可以删除该模块重新加入，会拉取最新的模块配置。',
            label: '',
            required: false,
            valueDesc: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpJsonBody',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            value: referenceBodyStr,
            label: '',
            required: false,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpFormBody',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            value: [],
            label: '',
            required: false,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpContentType',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'json',
            label: '',
            required: false,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          }
        ],
        outputs: [
          {
            id: 'system_addOutputParam',
            key: 'system_addOutputParam',
            type: FlowNodeOutputTypeEnum.dynamic,
            valueType: WorkflowIOValueTypeEnum.dynamic,
            label: '输出字段提取',
            customFieldConfig: {
              selectValueTypeList: [
                WorkflowIOValueTypeEnum.string,
                WorkflowIOValueTypeEnum.number,
                WorkflowIOValueTypeEnum.boolean,
                WorkflowIOValueTypeEnum.object,
                WorkflowIOValueTypeEnum.arrayString,
                WorkflowIOValueTypeEnum.arrayNumber,
                WorkflowIOValueTypeEnum.arrayBoolean,
                WorkflowIOValueTypeEnum.arrayObject,
                WorkflowIOValueTypeEnum.arrayAny,
                WorkflowIOValueTypeEnum.any,
                WorkflowIOValueTypeEnum.chatHistory,
                WorkflowIOValueTypeEnum.datasetQuote,
                WorkflowIOValueTypeEnum.dynamic,
                WorkflowIOValueTypeEnum.selectApp,
                WorkflowIOValueTypeEnum.selectDataset
              ],
              showDescription: false,
              showDefaultValue: false
            },
            description: '可以通过 JSONPath 语法来提取响应值中的指定字段',
            valueDesc: ''
          },
          {
            id: 'error',
            key: 'error',
            label: '请求错误',
            description: 'HTTP请求错误信息，成功时返回空',
            valueType: WorkflowIOValueTypeEnum.object,
            type: FlowNodeOutputTypeEnum.static,
            valueDesc: ''
          },
          {
            id: 'httpRawResponse',
            key: 'httpRawResponse',
            required: true,
            label: '原始响应',
            description: 'HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。',
            valueType: WorkflowIOValueTypeEnum.any,
            type: FlowNodeOutputTypeEnum.static,
            valueDesc: ''
          }
        ]
      },
      {
        nodeId: 'pluginConfig',
        name: i18nT('common:core.module.template.system_config'),
        intro: '',
        avatar: 'core/workflow/template/systemConfig',
        flowNodeType: FlowNodeTypeEnum.pluginConfig,
        position: {
          x: -88.12977161770735,
          y: -235.2337531748973
        },
        version: '4811',
        inputs: [],
        outputs: []
      }
    ],
    edges: [
      {
        source: 'pluginInput',
        target: 'vumlECDQTjeC',
        sourceHandle: 'pluginInput-source-right',
        targetHandle: 'vumlECDQTjeC-target-left'
      },
      {
        source: 'vumlECDQTjeC',
        target: 'pluginOutput',
        sourceHandle: 'vumlECDQTjeC-source-right',
        targetHandle: 'pluginOutput-target-left'
      }
    ],
    chatConfig: {}
  };
};
