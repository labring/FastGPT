// @ts-nocheck

import { AppItemType } from '@/types/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

type TemplateType = (AppItemType & {
  avatar: string;
  intro: string;
  type: AppTypeEnum;
})[];

// template
export const simpleBotTemplates: TemplateType = [
  {
    id: 'simpleChat',
    avatar: '/imgs/workflow/AI.png',
    name: '简易机器人',
    intro: '一个极其简单的 AI 应用，你可以绑定知识库或工具。',
    type: AppTypeEnum.simple,
    modules: [
      {
        nodeId: 'userGuide',
        name: '系统配置',
        intro: '可以配置应用的系统参数',
        avatar: '/imgs/workflow/userGuide.png',
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
            valueType: WorkflowIOValueTypeEnum.boolean,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: false
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
        name: '流程开始',
        intro: '',
        avatar: '/imgs/workflow/userChatInput.svg',
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
            label: '用户问题',
            required: true,
            toolDescription: '用户问题'
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
        name: 'AI 对话',
        intro: 'AI 大模型对话',
        avatar: '/imgs/workflow/AI.png',
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
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'gpt-3.5-turbo'
          },
          {
            key: 'temperature',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 0,
            valueType: WorkflowIOValueTypeEnum.number,
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 2000,
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
            description: 'core.app.tip.chatNodeSystemPromptTip',
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
            label: '用户问题',
            required: true,
            toolDescription: '用户问题',
            value: ['448745', 'userChatInput']
          },
          {
            key: 'quoteQA',
            renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
            label: '',
            debugLabel: '知识库引用',
            description: '',
            valueType: WorkflowIOValueTypeEnum.datasetQuote
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
    ]
  },
  {
    id: 'chatGuide',
    avatar: '/imgs/workflow/userGuide.png',
    name: '对话引导 + 变量',
    intro: '可以在对话开始发送一段提示，或者让用户填写一些内容，作为本次对话的变量',
    type: AppTypeEnum.simple,
    modules: [
      {
        nodeId: 'userGuide',
        name: '系统配置',
        intro: '可以配置应用的系统参数',
        avatar: '/imgs/workflow/userGuide.png',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        position: {
          x: 496.57560693988853,
          y: -490.7611729549753
        },
        version: '481',
        inputs: [
          {
            key: 'welcomeText',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'core.app.Welcome Text',
            value: '你好，我可以为你翻译各种语言，请告诉我你需要翻译成什么语言？'
          },
          {
            key: 'variables',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: 'core.app.Chat Variable',
            value: [
              {
                id: 'myb3xk',
                key: 'language',
                label: '目标语言',
                type: 'select',
                required: true,
                maxLen: 50,
                enums: [
                  {
                    value: '中文'
                  },
                  {
                    value: '英文'
                  }
                ]
              }
            ]
          },
          {
            key: 'questionGuide',
            valueType: WorkflowIOValueTypeEnum.boolean,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: false
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
        name: '流程开始',
        intro: '',
        avatar: '/imgs/workflow/userChatInput.svg',
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
            label: '用户问题',
            required: true,
            toolDescription: '用户问题'
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
        name: 'AI 对话',
        intro: 'AI 大模型对话',
        avatar: '/imgs/workflow/AI.png',
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
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'gpt-3.5-turbo'
          },
          {
            key: 'temperature',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 0,
            valueType: WorkflowIOValueTypeEnum.number,
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 2000,
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
            description: 'core.app.tip.chatNodeSystemPromptTip',
            placeholder: 'core.app.tip.chatNodeSystemPromptTip',
            value: '请直接将我的问题翻译成{{language}}，不需要回答问题。'
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
            label: '用户问题',
            required: true,
            toolDescription: '用户问题',
            value: ['448745', 'userChatInput']
          },
          {
            key: 'quoteQA',
            renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
            label: '',
            debugLabel: '知识库引用',
            description: '',
            valueType: WorkflowIOValueTypeEnum.datasetQuote
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
    ]
  },
  {
    id: 'simpleDatasetChat',
    avatar: '/imgs/workflow/db.png',
    name: '知识库+对话引导',
    intro: '每次提问时进行一次知识库搜索，将搜索结果注入 LLM 模型进行参考回答',
    type: AppTypeEnum.simple,
    modules: [
      {
        nodeId: 'userGuide',
        name: '系统配置',
        intro: '可以配置应用的系统参数',
        avatar: '/imgs/workflow/userGuide.png',
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
            value: '你好，我是知识库助手，请不要忘记选择知识库噢~\n[你是谁]\n[如何使用]'
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
            valueType: WorkflowIOValueTypeEnum.boolean,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: false
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
        nodeId: 'workflowStartNodeId',
        name: '流程开始',
        intro: '',
        avatar: '/imgs/workflow/userChatInput.svg',
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
            label: '用户问题',
            required: true,
            toolDescription: '用户问题'
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
        nodeId: '7BdojPlukIQw',
        name: 'AI 对话',
        intro: 'AI 大模型对话',
        avatar: '/imgs/workflow/AI.png',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        showStatus: true,
        position: {
          x: 1638.509551404687,
          y: -341.0428450861567
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
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'gpt-3.5-turbo'
          },
          {
            key: 'temperature',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 3,
            valueType: WorkflowIOValueTypeEnum.number,
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 1950,
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
            description: 'core.app.tip.chatNodeSystemPromptTip',
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
            label: '用户问题',
            required: true,
            toolDescription: '用户问题',
            value: ['workflowStartNodeId', 'userChatInput']
          },
          {
            key: 'quoteQA',
            renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
            label: '',
            debugLabel: '知识库引用',
            description: '',
            valueType: WorkflowIOValueTypeEnum.datasetQuote,
            value: ['iKBoX2vIzETU', 'quoteQA']
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
      },
      {
        nodeId: 'iKBoX2vIzETU',
        name: '知识库搜索',
        intro: '调用“语义检索”和“全文检索”能力，从“知识库”中查找可能与问题相关的参考内容',
        avatar: '/imgs/workflow/db.png',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        showStatus: true,
        position: {
          x: 918.5901682164496,
          y: -227.11542247619582
        },
        version: '481',
        inputs: [
          {
            key: 'datasets',
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            label: 'core.module.input.label.Select dataset',
            value: [],
            valueType: WorkflowIOValueTypeEnum.selectDataset,
            list: [],
            required: true
          },
          {
            key: 'similarity',
            renderTypeList: [FlowNodeInputTypeEnum.selectDatasetParamsModal],
            label: '',
            value: 0.4,
            valueType: WorkflowIOValueTypeEnum.number
          },
          {
            key: 'limit',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 1500,
            valueType: WorkflowIOValueTypeEnum.number
          },
          {
            key: 'searchMode',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'embedding'
          },
          {
            key: 'usingReRank',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: false
          },
          {
            key: 'datasetSearchUsingExtensionQuery',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: true
          },
          {
            key: 'datasetSearchExtensionModel',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            key: 'datasetSearchExtensionBg',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            value: ''
          },
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: '用户问题',
            required: true,
            toolDescription: '需要检索的内容',
            value: ['workflowStartNodeId', 'userChatInput']
          }
        ],
        outputs: [
          {
            id: 'quoteQA',
            key: 'quoteQA',
            label: 'core.module.Dataset quote.label',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.datasetQuote,
            description: '特殊数组格式，搜索结果为空时，返回空数组。'
          }
        ]
      }
    ],
    edges: [
      {
        source: 'workflowStartNodeId',
        target: 'iKBoX2vIzETU',
        sourceHandle: 'workflowStartNodeId-source-right',
        targetHandle: 'iKBoX2vIzETU-target-left'
      },
      {
        source: 'iKBoX2vIzETU',
        target: '7BdojPlukIQw',
        sourceHandle: 'iKBoX2vIzETU-source-right',
        targetHandle: '7BdojPlukIQw-target-left'
      }
    ]
  },
  {
    id: 'toolChat',
    avatar: '/imgs/workflow/history.png',
    name: '知道时间的机器人',
    intro: '通过挂载时间插件，让模型获取当前最新时间',
    type: AppTypeEnum.simple,
    modules: [
      {
        nodeId: 'userGuide',
        name: '系统配置',
        intro: '可以配置应用的系统参数',
        avatar: '/imgs/workflow/userGuide.png',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        position: {
          x: 531.2422736065552,
          y: -486.7611729549753
        },
        version: '481',
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'workflowStartNodeId',
        name: '流程开始',
        intro: '',
        avatar: '/imgs/workflow/userChatInput.svg',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        position: {
          x: 558.4082376415505,
          y: 123.72387429194112
        },
        version: '481',
        inputs: [
          {
            key: 'userChatInput',
            renderTypeList: ['reference', 'textarea'],
            valueType: 'string',
            label: '用户问题',
            required: true,
            toolDescription: '用户问题'
          }
        ],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            valueType: 'string',
            type: 'static'
          }
        ]
      },
      {
        nodeId: 'jrWPV9',
        name: '工具调用（实验）',
        intro: '通过AI模型自动选择一个或多个功能块进行调用，也可以对插件进行调用。',
        avatar: '/imgs/workflow/tool.svg',
        flowNodeType: FlowNodeTypeEnum.tools,
        showStatus: true,
        position: {
          x: 1062.1738942532802,
          y: -223.65033022650476
        },
        version: '481',
        inputs: [
          {
            key: 'model',
            renderTypeList: ['settingLLMModel', 'reference'],
            label: 'core.module.input.label.aiModel',
            valueType: 'string',
            llmModelType: 'all',
            value: 'gpt-3.5-turbo'
          },
          {
            key: 'temperature',
            renderTypeList: ['hidden'],
            label: '',
            value: 0,
            valueType: 'number',
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: ['hidden'],
            label: '',
            value: 2000,
            valueType: 'number',
            min: 100,
            max: 4000,
            step: 50
          },
          {
            key: 'systemPrompt',
            renderTypeList: ['textarea', 'reference'],
            max: 3000,
            valueType: 'string',
            label: 'core.ai.Prompt',
            description: 'core.app.tip.chatNodeSystemPromptTip',
            placeholder: 'core.app.tip.chatNodeSystemPromptTip',
            value: ''
          },
          {
            key: 'history',
            renderTypeList: ['numberInput', 'reference'],
            valueType: 'chatHistory',
            label: 'core.module.input.label.chat history',
            description: '最多携带多少轮对话记录',
            required: true,
            min: 0,
            max: 30,
            value: 6
          },
          {
            key: 'userChatInput',
            renderTypeList: ['reference', 'textarea'],
            valueType: 'string',
            label: '用户问题',
            required: true,
            value: ['workflowStartNodeId', 'userChatInput']
          }
        ],
        outputs: [
          {
            id: 'answerText',
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: 'string',
            type: 'static'
          }
        ]
      },
      {
        nodeId: 'zBxjo5',
        name: '获取当前时间',
        intro: '获取用户当前时区的时间。',
        avatar: '/imgs/workflow/getCurrentTime.svg',
        flowNodeType: 'pluginModule',
        showStatus: false,
        position: {
          x: 1000,
          y: 545
        },
        version: '481',
        inputs: [],
        outputs: [
          {
            id: 'time',
            type: 'static',
            key: 'time',
            valueType: 'string',
            label: 'time',
            description: ''
          }
        ],
        pluginId: 'community-getCurrentTime'
      }
    ],
    edges: [
      {
        source: 'workflowStartNodeId',
        target: 'jrWPV9',
        sourceHandle: 'workflowStartNodeId-source-right',
        targetHandle: 'jrWPV9-target-left'
      },
      {
        source: 'jrWPV9',
        target: 'zBxjo5',
        sourceHandle: 'selectedTools',
        targetHandle: 'selectedTools'
      }
    ],
    chatConfig: {
      scheduledTriggerConfig: {
        cronString: '',
        timezone: 'Asia/Shanghai',
        defaultPrompt: ''
      }
    }
  }
];

export const workflowTemplates: TemplateType = [
  {
    id: 'TranslateRobot',
    avatar: '/imgs/app/templates/translate.svg',
    name: '多轮翻译机器人',
    intro: '通过4轮翻译，提高翻译英文的质量',
    type: AppTypeEnum.workflow,
    modules: [
      {
        nodeId: 'userGuide',
        name: '系统配置',
        intro: '可以配置应用的系统参数',
        avatar: '/imgs/workflow/userGuide.png',
        flowNodeType: 'userGuide',
        position: {
          x: 531.2422736065552,
          y: -486.7611729549753
        },
        version: '481',
        inputs: [
          {
            key: 'welcomeText',
            renderTypeList: ['hidden'],
            valueType: 'string',
            label: 'core.app.Welcome Text',
            value: ''
          },
          {
            key: 'variables',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: 'core.app.Chat Variable',
            value: []
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            renderTypeList: ['hidden'],
            label: 'core.app.Question Guide',
            value: false
          },
          {
            key: 'tts',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: {
              type: 'web'
            }
          },
          {
            key: 'whisper',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: {
              open: false,
              autoSend: false,
              autoTTSResponse: false
            }
          },
          {
            key: 'scheduleTrigger',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: null
          }
        ],
        outputs: []
      },
      {
        nodeId: '448745',
        name: '流程开始',
        intro: '',
        avatar: '/imgs/workflow/userChatInput.svg',
        flowNodeType: 'workflowStart',
        position: {
          x: 558.4082376415505,
          y: 123.72387429194112
        },
        version: '481',
        inputs: [
          {
            key: 'userChatInput',
            renderTypeList: ['reference', 'textarea'],
            valueType: 'string',
            label: '用户问题',
            required: true,
            toolDescription: '用户问题'
          }
        ],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            valueType: 'string',
            type: 'static'
          }
        ]
      },
      {
        nodeId: 'loOvhld2ZTKa',
        name: '第一轮翻译',
        intro: 'AI 大模型对话',
        avatar: '/imgs/workflow/AI.png',
        flowNodeType: 'chatNode',
        showStatus: true,
        position: {
          x: 1748.8252410306534,
          y: -245.08260685989214
        },
        version: '481',
        inputs: [
          {
            key: 'model',
            renderTypeList: ['settingLLMModel', 'reference'],
            label: 'core.module.input.label.aiModel',
            valueType: 'string',
            value: 'gpt-4o'
          },
          {
            key: 'temperature',
            renderTypeList: ['hidden'],
            label: '',
            value: 0,
            valueType: 'number',
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: ['hidden'],
            label: '',
            value: 2000,
            valueType: 'number',
            min: 100,
            max: 4000,
            step: 50
          },
          {
            key: 'isResponseAnswerText',
            renderTypeList: ['hidden'],
            label: '',
            value: true,
            valueType: 'boolean'
          },
          {
            key: 'quoteTemplate',
            renderTypeList: ['hidden'],
            label: '',
            valueType: 'string'
          },
          {
            key: 'quotePrompt',
            renderTypeList: ['hidden'],
            label: '',
            valueType: 'string'
          },
          {
            key: 'systemPrompt',
            renderTypeList: ['textarea', 'reference'],
            max: 3000,
            valueType: 'string',
            label: 'core.ai.Prompt',
            description: 'core.app.tip.chatNodeSystemPromptTip',
            placeholder: 'core.app.tip.chatNodeSystemPromptTip',
            value:
              '# Role: 资深英汉翻译专家\n\n## Background:\n你是一位经验丰富的英汉翻译专家,精通英汉互译,尤其擅长将英文文章译成流畅易懂的现代汉语。你曾多次带领团队完成大型翻译项目,译文广受好评。\n\n## Attention:\n- 翻译过程中要始终坚持"信、达、雅"的原则,但"达"尤为重要\n- 译文要符合现代汉语的表达习惯,通俗易懂,连贯流畅 \n- 避免使用过于文绉绉的表达和晦涩难懂的典故引用\n\n## Profile:  \n- Author: 米开朗基杨 \n- Version: 0.2\n- Language: 中文\n- Description: 你是一位资深英汉翻译专家,精通英汉互译。你擅长将英文文章译成地道流畅的现代汉语,表达准确易懂,符合当代中文语言习惯。\n\n## Constraints:\n- 必须严格遵循四轮翻译流程:直译、意译、校审、定稿  \n- 译文要忠实原文,准确无误,不能遗漏或曲解原意\n- 译文应以现代白话文为主,避免过多使用文言文和古典诗词\n- 每一轮翻译前后必须添加【思考】和【翻译】标记\n- 最终译文使用Markdown的代码块呈现\n\n## Goals:\n- 通过四轮翻译流程,将英文原文译成高质量的现代汉语译文  \n- 译文要准确传达原文意思,语言表达力求浅显易懂,朗朗上口\n- 适度使用一些熟语俗语、流行网络用语等,增强译文的亲和力\n- 在直译的基础上,提供至少2个不同风格的意译版本供选择\n\n## Skills:\n- 精通英汉双语,具有扎实的语言功底和丰富的翻译经验\n- 擅长将英语表达习惯转换为地道自然的现代汉语\n- 对当代中文语言的发展变化有敏锐洞察,善于把握语言流行趋势\n\n## Workflow:\n1. 第一轮直译:逐字逐句忠实原文,不遗漏任何信息\n2. 第二轮意译:在直译的基础上用通俗流畅的现代汉语意译原文,至少提供2个不同风格的版本\n3. 第三轮校审:仔细审视译文,消除偏差和欠缺,使译文更加地道易懂 \n4. 第四轮定稿:择优选取,反复修改润色,最终定稿出一个简洁畅达、符合大众阅读习惯的译文\n\n## OutputFormat: \n- 每一轮翻译前用【思考】说明该轮要点\n- 每一轮翻译后用【翻译】呈现译文\n- 在\\`\\`\\`代码块中展示最终定稿译文\n\n## Suggestions:\n- 直译时力求忠实原文,但不要过于拘泥逐字逐句\n- 意译时在准确表达原意的基础上,用最朴实无华的现代汉语来表达 \n- 校审环节重点关注译文是否符合当代汉语表达习惯,是否通俗易懂\n- 定稿时适度采用一些熟语谚语、网络流行语等,使译文更接地气\n- 善于利用中文的灵活性,用不同的表述方式展现同一内容,提高译文的可读性\n\n## Initialization\n作为一名资深英汉翻译专家,你必须严格遵循翻译流程的各项要求。首先请向用户问好,介绍你将带领团队完成翻译任务,力求将英文原文译成通俗易懂的现代汉语。然后简要说明四轮翻译流程,请用户提供英文原文,开始进行翻译工作。'
          },
          {
            key: 'history',
            renderTypeList: ['numberInput', 'reference'],
            valueType: 'chatHistory',
            label: 'core.module.input.label.chat history',
            description: '最多携带多少轮对话记录',
            required: true,
            min: 0,
            max: 30,
            value: 6
          },
          {
            key: 'userChatInput',
            renderTypeList: ['reference', 'textarea'],
            valueType: 'string',
            label: '用户问题',
            required: true,
            toolDescription: '用户问题',
            value: ['k2QsBOBmH9Xu', 'text']
          },
          {
            key: 'quoteQA',
            renderTypeList: ['settingDatasetQuotePrompt'],
            label: '',
            debugLabel: '知识库引用',
            description: '',
            valueType: 'datasetQuote'
          }
        ],
        outputs: [
          {
            id: 'history',
            key: 'history',
            label: 'core.module.output.label.New context',
            description: 'core.module.output.description.New context',
            valueType: 'chatHistory',
            type: 'static',
            required: true
          },
          {
            id: 'answerText',
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: 'string',
            type: 'static',
            required: true
          }
        ]
      },
      {
        nodeId: 'k2QsBOBmH9Xu',
        name: '原文声明',
        intro: '可对固定或传入的文本进行加工后输出，非字符串类型数据最终会转成字符串类型。',
        avatar: '/imgs/workflow/textEditor.svg',
        flowNodeType: 'pluginModule',
        showStatus: false,
        position: {
          x: 1000.9259923224292,
          y: 3.3737410194846404
        },
        version: '481',
        inputs: [
          {
            key: 'system_addInputParam',
            valueType: 'dynamic',
            label: '动态外部数据',
            renderTypeList: ['addInputParam'],
            required: false,
            description: '',
            canEdit: false,
            value: '',
            editField: {
              key: true
            },
            dynamicParamDefaultValue: {
              inputType: 'reference',
              valueType: 'string',
              required: true
            }
          },
          {
            key: 'q',
            valueType: 'string',
            label: 'q',
            renderTypeList: ['reference'],
            required: true,
            description: '',
            canEdit: true,
            editField: {
              key: true
            },
            value: ['448745', 'userChatInput']
          },
          {
            key: '文本',
            valueType: 'string',
            label: '文本',
            renderTypeList: ['textarea'],
            required: true,
            description: '',
            canEdit: false,
            value: '原文:\n"""\n{{q}}\n"""',
            editField: {
              key: true
            },
            maxLength: '',
            dynamicParamDefaultValue: {
              inputType: 'reference',
              valueType: 'string',
              required: true
            }
          }
        ],
        outputs: [
          {
            id: 'text',
            type: 'static',
            key: 'text',
            valueType: 'string',
            label: 'text',
            description: ''
          }
        ],
        pluginId: 'community-textEditor'
      },
      {
        nodeId: 'w0oBbQ3YJHye',
        name: '代码运行',
        intro: '执行一段简单的脚本代码，通常用于进行复杂的数据处理。',
        avatar: '/imgs/workflow/code.svg',
        flowNodeType: 'code',
        showStatus: true,
        position: {
          x: 2522.61682940854,
          y: -79.74569750380468
        },
        version: '482',
        inputs: [
          {
            key: 'system_addInputParam',
            renderTypeList: ['addInputParam'],
            valueType: 'dynamic',
            label: '',
            required: false,
            description: '这些变量会作为代码的运行的输入参数',
            editField: {
              key: true,
              valueType: true
            }
          },
          {
            key: 'data1',
            valueType: 'string',
            label: 'data1',
            renderTypeList: ['reference'],
            description: '',
            canEdit: true,
            editField: {
              key: true,
              valueType: true
            },
            value: ['loOvhld2ZTKa', 'answerText']
          },
          {
            key: 'codeType',
            renderTypeList: ['hidden'],
            label: '',
            value: 'js'
          },
          {
            key: 'code',
            renderTypeList: ['custom'],
            label: '',
            value:
              'function main({data1}){\n    const result = data1.split("```").filter(item => !!item.trim())\n\n    if(result[result.length-1]) {\n        return {\n            result: result[result.length-1]\n        }\n    }\n\n    return {\n        result: \'未截取到翻译内容\'\n    }\n}'
          }
        ],
        outputs: [
          {
            id: 'system_addOutputParam',
            key: 'system_addOutputParam',
            type: 'dynamic',
            valueType: 'dynamic',
            label: '',
            editField: {
              key: true,
              valueType: true
            },
            description: '将代码中 return 的对象作为输出，传递给后续的节点'
          },
          {
            id: 'system_rawResponse',
            key: 'system_rawResponse',
            label: '完整响应数据',
            valueType: 'object',
            type: 'static'
          },
          {
            id: 'error',
            key: 'error',
            label: '运行错误',
            description: '代码运行错误信息，成功时返回空',
            valueType: 'object',
            type: 'static'
          },
          {
            id: 'qLUQfhG0ILRX',
            type: 'dynamic',
            key: 'result',
            valueType: 'string',
            label: 'result'
          }
        ]
      },
      {
        nodeId: 'foO69L5FOmDQ',
        name: '指定回复',
        intro:
          '该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。',
        avatar: '/imgs/workflow/reply.png',
        flowNodeType: 'answerNode',
        position: {
          x: 3798.4479531204515,
          y: 116.03040242110023
        },
        version: '481',
        inputs: [
          {
            key: 'text',
            renderTypeList: ['textarea', 'reference'],
            valueType: 'any',
            required: true,
            label: 'core.module.input.label.Response content',
            description: 'core.module.input.description.Response content',
            placeholder: 'core.module.input.description.Response content',
            selectedTypeIndex: 1,
            value: ['v9ijHqeA2NY2', 'text']
          }
        ],
        outputs: []
      },
      {
        nodeId: 'v9ijHqeA2NY2',
        name: '合并输出结果',
        intro: '可对固定或传入的文本进行加工后输出，非字符串类型数据最终会转成字符串类型。',
        avatar: '/imgs/workflow/textEditor.svg',
        flowNodeType: 'pluginModule',
        showStatus: false,
        position: {
          x: 3083.567683275386,
          y: 60.05513835086097
        },
        version: '481',
        inputs: [
          {
            key: 'system_addInputParam',
            valueType: 'dynamic',
            label: '动态外部数据',
            renderTypeList: ['addInputParam'],
            required: false,
            description: '',
            canEdit: false,
            value: '',
            editField: {
              key: true
            },
            dynamicParamDefaultValue: {
              inputType: 'reference',
              valueType: 'string',
              required: true
            }
          },
          {
            key: 'result',
            valueType: 'string',
            label: 'result',
            renderTypeList: ['reference'],
            required: true,
            description: '',
            canEdit: true,
            editField: {
              key: true
            },
            value: ['w0oBbQ3YJHye', 'qLUQfhG0ILRX']
          },
          {
            key: '文本',
            valueType: 'string',
            label: '文本',
            renderTypeList: ['textarea'],
            required: true,
            description: '',
            canEdit: false,
            value: '------\n\n最终翻译结果如下: \n\n```\n{{result}}\n```',
            editField: {
              key: true
            },
            maxLength: '',
            dynamicParamDefaultValue: {
              inputType: 'reference',
              valueType: 'string',
              required: true
            }
          }
        ],
        outputs: [
          {
            id: 'text',
            type: 'static',
            key: 'text',
            valueType: 'string',
            label: 'text',
            description: ''
          }
        ],
        pluginId: 'community-textEditor'
      }
    ],
    edges: [
      {
        source: '448745',
        target: 'k2QsBOBmH9Xu',
        sourceHandle: '448745-source-right',
        targetHandle: 'k2QsBOBmH9Xu-target-left'
      },
      {
        source: 'k2QsBOBmH9Xu',
        target: 'loOvhld2ZTKa',
        sourceHandle: 'k2QsBOBmH9Xu-source-right',
        targetHandle: 'loOvhld2ZTKa-target-left'
      },
      {
        source: 'loOvhld2ZTKa',
        target: 'w0oBbQ3YJHye',
        sourceHandle: 'loOvhld2ZTKa-source-right',
        targetHandle: 'w0oBbQ3YJHye-target-left'
      },
      {
        source: 'w0oBbQ3YJHye',
        target: 'v9ijHqeA2NY2',
        sourceHandle: 'w0oBbQ3YJHye-source-right',
        targetHandle: 'v9ijHqeA2NY2-target-left'
      },
      {
        source: 'v9ijHqeA2NY2',
        target: 'foO69L5FOmDQ',
        sourceHandle: 'v9ijHqeA2NY2-source-right',
        targetHandle: 'foO69L5FOmDQ-target-left'
      }
    ]
  },
  {
    id: 'google',
    avatar: '/imgs/app/templates/google.svg',
    name: '谷歌搜索',
    intro: '通过请求谷歌搜索，查询相关内容作为模型的参考。',
    type: AppTypeEnum.workflow,
    modules: [
      {
        nodeId: 'userGuide',
        name: '系统配置',
        intro: '可以配置应用的系统参数',
        avatar: '/imgs/workflow/userGuide.png',
        flowNodeType: 'userGuide',
        position: {
          x: 262.2732338817093,
          y: -476.00241136598146
        },
        version: '481',
        inputs: [
          {
            key: 'welcomeText',
            renderTypeList: ['hidden'],
            valueType: 'string',
            label: 'core.app.Welcome Text',
            value: ''
          },
          {
            key: 'variables',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: 'core.app.Chat Variable',
            value: []
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            renderTypeList: ['hidden'],
            label: 'core.app.Question Guide',
            value: false
          },
          {
            key: 'tts',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: {
              type: 'web'
            }
          },
          {
            key: 'whisper',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: {
              open: false,
              autoSend: false,
              autoTTSResponse: false
            }
          },
          {
            key: 'scheduleTrigger',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: null
          }
        ],
        outputs: []
      },
      {
        nodeId: '448745',
        name: '流程开始',
        intro: '',
        avatar: '/imgs/workflow/userChatInput.svg',
        flowNodeType: 'workflowStart',
        position: {
          x: 295.8944548701009,
          y: 110.81336038514848
        },
        version: '481',
        inputs: [
          {
            key: 'userChatInput',
            renderTypeList: ['reference', 'textarea'],
            valueType: 'string',
            label: '用户问题',
            required: true,
            toolDescription: '用户问题'
          }
        ],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            valueType: 'string',
            type: 'static'
          }
        ]
      },
      {
        nodeId: 'NOgbnBzUwDgT',
        name: '工具调用（实验）',
        intro: '通过AI模型自动选择一个或多个功能块进行调用，也可以对插件进行调用。',
        avatar: '/imgs/workflow/tool.svg',
        flowNodeType: 'tools',
        showStatus: true,
        position: {
          x: 1028.8358722416106,
          y: -500.8755882990822
        },
        version: '481',
        inputs: [
          {
            key: 'model',
            renderTypeList: ['settingLLMModel', 'reference'],
            label: 'core.module.input.label.aiModel',
            valueType: 'string',
            llmModelType: 'all',
            value: 'FastAI-plus'
          },
          {
            key: 'temperature',
            renderTypeList: ['hidden'],
            label: '',
            value: 0,
            valueType: 'number',
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: ['hidden'],
            label: '',
            value: 2000,
            valueType: 'number',
            min: 100,
            max: 4000,
            step: 50
          },
          {
            key: 'systemPrompt',
            renderTypeList: ['textarea', 'reference'],
            max: 3000,
            valueType: 'string',
            label: 'core.ai.Prompt',
            description: 'core.app.tip.chatNodeSystemPromptTip',
            placeholder: 'core.app.tip.chatNodeSystemPromptTip',
            value: ''
          },
          {
            key: 'history',
            renderTypeList: ['numberInput', 'reference'],
            valueType: 'chatHistory',
            label: 'core.module.input.label.chat history',
            description: '最多携带多少轮对话记录',
            required: true,
            min: 0,
            max: 30,
            value: 6
          },
          {
            key: 'userChatInput',
            renderTypeList: ['reference', 'textarea'],
            valueType: 'string',
            label: '用户问题',
            required: true,
            value: ['448745', 'userChatInput']
          }
        ],
        outputs: [
          {
            id: NodeOutputKeyEnum.answerText,
            key: NodeOutputKeyEnum.answerText,
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      },
      {
        nodeId: 'GMELVPxHfpg5',
        name: 'HTTP 请求',
        intro: '调用谷歌搜索，查询相关内容',
        avatar: '/imgs/workflow/http.png',
        flowNodeType: 'httpRequest468',
        showStatus: true,
        position: {
          x: 1005.4777753640342,
          y: 319.4905539380939
        },
        version: '481',
        inputs: [
          {
            key: 'system_addInputParam',
            renderTypeList: ['addInputParam'],
            valueType: 'dynamic',
            label: '',
            required: false,
            description: 'core.module.input.description.HTTP Dynamic Input',
            editField: {
              key: true,
              valueType: true
            }
          },
          {
            valueType: 'string',
            renderTypeList: ['reference'],
            key: 'query',
            label: 'query',
            toolDescription: '谷歌搜索检索词',
            required: true,
            canEdit: true,
            editField: {
              key: true,
              description: true
            }
          },
          {
            key: 'system_httpMethod',
            renderTypeList: ['custom'],
            valueType: 'string',
            label: '',
            value: 'GET',
            required: true
          },
          {
            key: 'system_httpReqUrl',
            renderTypeList: ['hidden'],
            valueType: 'string',
            label: '',
            description: 'core.module.input.description.Http Request Url',
            placeholder: 'https://api.ai.com/getInventory',
            required: false,
            value: 'https://www.googleapis.com/customsearch/v1'
          },
          {
            key: 'system_httpHeader',
            renderTypeList: ['custom'],
            valueType: 'any',
            value: [],
            label: '',
            description: 'core.module.input.description.Http Request Header',
            placeholder: 'core.module.input.description.Http Request Header',
            required: false
          },
          {
            key: 'system_httpParams',
            renderTypeList: ['hidden'],
            valueType: 'any',
            value: [
              {
                key: 'q',
                type: 'string',
                value: '{{query}}'
              },
              {
                key: 'cx',
                type: 'string',
                value: '谷歌搜索cxID'
              },
              {
                key: 'key',
                type: 'string',
                value: '谷歌搜索key'
              },
              {
                key: 'c2coff',
                type: 'string',
                value: '1'
              },
              {
                key: 'start',
                type: 'string',
                value: '1'
              },
              {
                key: 'end',
                type: 'string',
                value: '20'
              },
              {
                key: 'dateRestrict',
                type: 'string',
                value: 'm[1]'
              }
            ],
            label: '',
            required: false
          },
          {
            key: 'system_httpJsonBody',
            renderTypeList: ['hidden'],
            valueType: 'any',
            value: '',
            label: '',
            required: false
          }
        ],
        outputs: [
          {
            id: 'system_addOutputParam',
            key: 'system_addOutputParam',
            type: 'dynamic',
            valueType: 'dynamic',
            label: '',
            editField: {
              key: true,
              valueType: true
            }
          },
          {
            id: 'httpRawResponse',
            key: 'httpRawResponse',
            label: '原始响应',
            description: 'HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。',
            valueType: 'any',
            type: 'static',
            required: true
          },
          {
            id: 'M5YmxaYe8em1',
            type: 'dynamic',
            key: 'prompt',
            valueType: 'string',
            label: 'prompt'
          }
        ]
      },
      {
        nodeId: 'poIbrrA8aiR0',
        name: '代码运行',
        intro: '执行一段简单的脚本代码，通常用于进行复杂的数据处理。',
        avatar: '/imgs/workflow/code.svg',
        flowNodeType: 'code',
        showStatus: true,
        position: {
          x: 1711.805344753384,
          y: 650.1023414708576
        },
        version: '482',
        inputs: [
          {
            key: 'system_addInputParam',
            renderTypeList: ['addInputParam'],
            valueType: 'dynamic',
            label: '',
            required: false,
            description: '这些变量会作为代码的运行的输入参数',
            editField: {
              key: true,
              valueType: true
            }
          },
          {
            key: 'data',
            valueType: 'object',
            label: 'data',
            renderTypeList: ['reference'],
            description: '',
            canEdit: true,
            editField: {
              key: true,
              valueType: true
            },
            value: ['GMELVPxHfpg5', 'httpRawResponse']
          },
          {
            key: 'codeType',
            renderTypeList: ['hidden'],
            label: '',
            value: 'js'
          },
          {
            key: 'code',
            renderTypeList: ['custom'],
            label: '',
            value:
              'function main({data}){\n    const result = data.items.map((item) => ({\n      title: item.title,\n      link: item.link,\n      snippet: item.snippet\n    }))\n    return { prompt: JSON.stringify(result) }\n}'
          }
        ],
        outputs: [
          {
            id: 'system_addOutputParam',
            key: 'system_addOutputParam',
            type: 'dynamic',
            valueType: 'dynamic',
            label: '',
            editField: {
              key: true,
              valueType: true
            },
            description: '将代码中 return 的对象作为输出，传递给后续的节点'
          },
          {
            id: 'system_rawResponse',
            key: 'system_rawResponse',
            label: '完整响应数据',
            valueType: 'object',
            type: 'static'
          },
          {
            id: 'error',
            key: 'error',
            label: '运行错误',
            description: '代码运行错误信息，成功时返回空',
            valueType: 'object',
            type: 'static'
          },
          {
            id: 'qLUQfhG0ILRX',
            type: 'dynamic',
            key: 'prompt',
            valueType: 'string',
            label: 'prompt'
          }
        ]
      }
    ],
    edges: [
      {
        source: '448745',
        target: 'NOgbnBzUwDgT',
        sourceHandle: '448745-source-right',
        targetHandle: 'NOgbnBzUwDgT-target-left'
      },
      {
        source: 'NOgbnBzUwDgT',
        target: 'GMELVPxHfpg5',
        sourceHandle: 'selectedTools',
        targetHandle: 'selectedTools'
      },
      {
        source: 'GMELVPxHfpg5',
        target: 'poIbrrA8aiR0',
        sourceHandle: 'GMELVPxHfpg5-source-right',
        targetHandle: 'poIbrrA8aiR0-target-left'
      }
    ]
  },
  {
    id: 'dalle',
    avatar: '/imgs/app/templates/dalle.svg',
    name: 'Dalle3绘图',
    intro: '通过请求Dalle3接口绘图，需要有 api key',
    type: AppTypeEnum.workflow,
    modules: [
      {
        nodeId: 'userGuide',
        name: '系统配置',
        intro: '可以配置应用的系统参数',
        avatar: '/imgs/workflow/userGuide.png',
        flowNodeType: 'userGuide',
        position: {
          x: 531.2422736065552,
          y: -486.7611729549753
        },
        inputs: [
          {
            key: 'welcomeText',
            renderTypeList: ['hidden'],
            valueType: 'string',
            label: 'core.app.Welcome Text',
            value: ''
          },
          {
            key: 'variables',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: 'core.app.Chat Variable',
            value: []
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            renderTypeList: ['hidden'],
            label: 'core.app.Question Guide',
            value: false
          },
          {
            key: 'tts',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: {
              type: 'web'
            }
          },
          {
            key: 'whisper',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: {
              open: false,
              autoSend: false,
              autoTTSResponse: false
            }
          },
          {
            key: 'scheduleTrigger',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: null
          }
        ],
        outputs: []
      },
      {
        nodeId: '448745',
        name: '流程开始',
        intro: '',
        avatar: '/imgs/workflow/userChatInput.svg',
        flowNodeType: 'workflowStart',
        position: {
          x: 532.1275542407774,
          y: 46.03775600322817
        },
        inputs: [
          {
            key: 'userChatInput',
            renderTypeList: ['reference', 'textarea'],
            valueType: 'string',
            label: '用户问题',
            required: true,
            toolDescription: '用户问题'
          }
        ],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            valueType: 'string',
            type: 'static'
          }
        ]
      },
      {
        nodeId: 'tMyUnRL5jIrC',
        name: 'HTTP 请求',
        intro: '可以发出一个 HTTP 请求，实现更为复杂的操作（联网搜索、数据库查询等）',
        avatar: '/imgs/workflow/http.png',
        flowNodeType: 'httpRequest468',
        showStatus: true,
        position: {
          x: 921.2377506442713,
          y: -483.94114977914256
        },
        inputs: [
          {
            key: 'system_addInputParam',
            renderTypeList: ['addInputParam'],
            valueType: 'dynamic',
            label: '',
            required: false,
            description: 'core.module.input.description.HTTP Dynamic Input',
            editField: {
              key: true,
              valueType: true
            }
          },
          {
            key: 'prompt',
            valueType: 'string',
            label: 'prompt',
            renderTypeList: ['reference'],
            description: '',
            canEdit: true,
            editField: {
              key: true,
              valueType: true
            },
            value: ['448745', 'userChatInput']
          },
          {
            key: 'system_httpMethod',
            renderTypeList: ['custom'],
            valueType: 'string',
            label: '',
            value: 'POST',
            required: true
          },
          {
            key: 'system_httpReqUrl',
            renderTypeList: ['hidden'],
            valueType: 'string',
            label: '',
            description: 'core.module.input.description.Http Request Url',
            placeholder: 'https://api.ai.com/getInventory',
            required: false,
            value: 'https://api.openai.com/v1/images/generations'
          },
          {
            key: 'system_httpHeader',
            renderTypeList: ['custom'],
            valueType: 'any',
            value: [
              {
                key: 'Authorization',
                type: 'string',
                value: 'Bearer '
              }
            ],
            label: '',
            description: 'core.module.input.description.Http Request Header',
            placeholder: 'core.module.input.description.Http Request Header',
            required: false
          },
          {
            key: 'system_httpParams',
            renderTypeList: ['hidden'],
            valueType: 'any',
            value: [],
            label: '',
            required: false
          },
          {
            key: 'system_httpJsonBody',
            renderTypeList: ['hidden'],
            valueType: 'any',
            value:
              '{\n  "model": "dall-e-3",\n  "prompt": "{{prompt}}",\n  "n": 1,\n  "size": "1024x1024"\n}',
            label: '',
            required: false
          }
        ],
        outputs: [
          {
            id: 'system_addOutputParam',
            key: 'system_addOutputParam',
            type: 'dynamic',
            valueType: 'dynamic',
            label: '',
            editField: {
              key: true,
              valueType: true
            }
          },
          {
            id: 'httpRawResponse',
            key: 'httpRawResponse',
            label: '原始响应',
            description: 'HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。',
            valueType: 'any',
            type: 'static'
          },
          {
            id: 'DeKGGioBwaMf',
            type: 'dynamic',
            key: 'data[0].url',
            valueType: 'string',
            label: 'data[0].url'
          }
        ]
      },
      {
        nodeId: 'CO3POL8svbbi',
        name: '文本加工',
        intro: '可对固定或传入的文本进行加工后输出，非字符串类型数据最终会转成字符串类型。',
        avatar: '/imgs/workflow/textEditor.svg',
        flowNodeType: 'pluginModule',
        showStatus: false,
        position: {
          x: 1417.5940290051137,
          y: -478.81889618104356
        },
        inputs: [
          {
            key: 'system_addInputParam',
            valueType: 'dynamic',
            label: '动态外部数据',
            renderTypeList: ['addInputParam'],
            required: false,
            description: '',
            canEdit: false,
            value: '',
            editField: {
              key: true
            },
            dynamicParamDefaultValue: {
              inputType: 'reference',
              valueType: 'string',
              required: true
            }
          },
          {
            key: 'url',
            valueType: 'string',
            label: 'url',
            renderTypeList: ['reference'],
            required: true,
            description: '',
            canEdit: true,
            editField: {
              key: true
            },
            value: ['tMyUnRL5jIrC', 'DeKGGioBwaMf']
          },
          {
            key: '文本',
            valueType: 'string',
            label: '文本',
            renderTypeList: ['textarea'],
            required: true,
            description: '',
            canEdit: false,
            value: '![]({{url}})',
            editField: {
              key: true
            },
            maxLength: '',
            dynamicParamDefaultValue: {
              inputType: 'reference',
              valueType: 'string',
              required: true
            }
          }
        ],
        outputs: [
          {
            id: 'text',
            type: 'static',
            key: 'text',
            valueType: 'string',
            label: 'text',
            description: ''
          }
        ],
        pluginId: 'community-textEditor'
      },
      {
        nodeId: '7mapnCgHfKW6',
        name: '指定回复',
        intro:
          '该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。',
        avatar: '/imgs/workflow/reply.png',
        flowNodeType: 'answerNode',
        position: {
          x: 1922.5628399315042,
          y: -471.67391598231796
        },
        inputs: [
          {
            key: 'text',
            renderTypeList: ['textarea', 'reference'],
            valueType: 'string',
            label: 'core.module.input.label.Response content',
            description: 'core.module.input.description.Response content',
            placeholder: 'core.module.input.description.Response content',
            selectedTypeIndex: 1,
            value: ['CO3POL8svbbi', 'text']
          }
        ],
        outputs: []
      }
    ],
    edges: [
      {
        source: '448745',
        target: 'tMyUnRL5jIrC',
        sourceHandle: '448745-source-right',
        targetHandle: 'tMyUnRL5jIrC-target-left'
      },
      {
        source: 'tMyUnRL5jIrC',
        target: 'CO3POL8svbbi',
        sourceHandle: 'tMyUnRL5jIrC-source-right',
        targetHandle: 'CO3POL8svbbi-target-left'
      },
      {
        source: 'CO3POL8svbbi',
        target: '7mapnCgHfKW6',
        sourceHandle: 'CO3POL8svbbi-source-right',
        targetHandle: '7mapnCgHfKW6-target-left'
      }
    ]
  },
  {
    id: 'CQ',
    avatar: '/imgs/workflow/cq.png',
    name: '问题分类 + 知识库',
    intro: '先对用户的问题进行分类，再根据不同类型问题，执行不同的操作',
    type: AppTypeEnum.workflow,
    modules: [
      {
        nodeId: 'userGuide',
        name: '系统配置',
        intro: '可以配置应用的系统参数',
        avatar: '/imgs/workflow/userGuide.png',
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
            value: '你好，我是知识库助手，请不要忘记选择知识库噢~\n[你是谁]\n[如何使用]'
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
            valueType: WorkflowIOValueTypeEnum.boolean,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: true
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
        nodeId: 'workflowStartNodeId',
        name: '流程开始',
        intro: '',
        avatar: '/imgs/workflow/userChatInput.svg',
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
            label: '用户问题',
            required: true,
            toolDescription: '用户问题'
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
        nodeId: '7BdojPlukIQw',
        name: 'AI 对话',
        intro: 'AI 大模型对话',
        avatar: '/imgs/workflow/AI.png',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        showStatus: true,
        position: {
          x: 2701.1267277679685,
          y: -767.8956312653042
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
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'gpt-3.5-turbo'
          },
          {
            key: 'temperature',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 3,
            valueType: WorkflowIOValueTypeEnum.number,
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 1950,
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
            description: 'core.app.tip.chatNodeSystemPromptTip',
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
            label: '用户问题',
            required: true,
            toolDescription: '用户问题',
            value: ['workflowStartNodeId', 'userChatInput']
          },
          {
            key: 'quoteQA',
            renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
            label: '',
            debugLabel: '知识库引用',
            description: '',
            valueType: WorkflowIOValueTypeEnum.datasetQuote,
            value: ['MNMMMIjjWyMU', 'quoteQA']
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
      },
      {
        nodeId: 'rvbo634w3AYj',
        name: '问题分类',
        intro:
          '根据用户的历史记录和当前问题判断该次提问的类型。可以添加多组问题类型，下面是一个模板例子：\n类型1: 打招呼\n类型2: 关于商品“使用”问题\n类型3: 关于商品“购买”问题\n类型4: 其他问题',
        avatar: '/imgs/workflow/cq.png',
        flowNodeType: FlowNodeTypeEnum.classifyQuestion,
        showStatus: true,
        position: {
          x: 1020.9667229609946,
          y: -385.0060974413916
        },
        version: '481',
        inputs: [
          {
            key: 'model',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel, FlowNodeInputTypeEnum.reference],
            label: 'core.module.input.label.aiModel',
            required: true,
            valueType: WorkflowIOValueTypeEnum.string,
            llmModelType: 'classify',
            value: 'gpt-3.5-turbo'
          },
          {
            key: 'systemPrompt',
            renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
            max: 3000,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'core.module.input.label.Background',
            description: 'core.module.input.description.Background',
            placeholder: 'core.module.input.placeholder.Classify background',
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
            label: '用户问题',
            required: true,
            value: ['workflowStartNodeId', 'userChatInput']
          },
          {
            key: 'agents',
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: [
              {
                value: '关于电影《星际穿越》的问题',
                key: 'wqre'
              },
              {
                value: '打招呼、问候等问题',
                key: 'sdfa'
              },
              {
                value: '其他问题',
                key: 'agex'
              }
            ]
          }
        ],
        outputs: [
          {
            id: 'cqResult',
            key: 'cqResult',
            label: '分类结果',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      },
      {
        nodeId: '7kwgL1dVlwG6',
        name: '指定回复',
        intro:
          '该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。',
        avatar: '/imgs/workflow/reply.png',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        position: {
          x: 1874.9167551056487,
          y: 434.98431875888207
        },
        version: '481',
        inputs: [
          {
            key: 'text',
            renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'core.module.input.label.Response content',
            description: 'core.module.input.description.Response content',
            placeholder: 'core.module.input.description.Response content',
            selectedTypeIndex: 1,
            value: ['rvbo634w3AYj', 'cqResult']
          }
        ],
        outputs: []
      },
      {
        nodeId: 'MNMMMIjjWyMU',
        name: '知识库搜索',
        intro: '调用“语义检索”和“全文检索”能力，从“知识库”中查找可能与问题相关的参考内容',
        avatar: '/imgs/workflow/db.png',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        showStatus: true,
        position: {
          x: 1851.010152279949,
          y: -613.3555232387284
        },
        version: '481',
        inputs: [
          {
            key: 'datasets',
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            label: 'core.module.input.label.Select dataset',
            value: [],
            valueType: WorkflowIOValueTypeEnum.selectDataset,
            list: [],
            required: true
          },
          {
            key: 'similarity',
            renderTypeList: [FlowNodeInputTypeEnum.selectDatasetParamsModal],
            label: '',
            value: 0.4,
            valueType: WorkflowIOValueTypeEnum.number
          },
          {
            key: 'limit',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 1500,
            valueType: WorkflowIOValueTypeEnum.number
          },
          {
            key: 'searchMode',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'embedding'
          },
          {
            key: 'usingReRank',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: false
          },
          {
            key: 'datasetSearchUsingExtensionQuery',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: true
          },
          {
            key: 'datasetSearchExtensionModel',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            key: 'datasetSearchExtensionBg',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            value: ''
          },
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: '用户问题',
            required: true,
            toolDescription: '需要检索的内容',
            value: ['workflowStartNodeId', 'userChatInput']
          }
        ],
        outputs: [
          {
            id: 'quoteQA',
            key: 'quoteQA',
            label: 'core.module.Dataset quote.label',
            description: '特殊数组格式，搜索结果为空时，返回空数组。',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.datasetQuote
          }
        ]
      }
    ],
    edges: [
      {
        source: 'workflowStartNodeId',
        target: 'rvbo634w3AYj',
        sourceHandle: 'workflowStartNodeId-source-right',
        targetHandle: 'rvbo634w3AYj-target-left'
      },
      {
        source: 'rvbo634w3AYj',
        target: '7kwgL1dVlwG6',
        sourceHandle: 'rvbo634w3AYj-source-agex',
        targetHandle: '7kwgL1dVlwG6-target-left'
      },
      {
        source: 'rvbo634w3AYj',
        target: 'MNMMMIjjWyMU',
        sourceHandle: 'rvbo634w3AYj-source-wqre',
        targetHandle: 'MNMMMIjjWyMU-target-left'
      },
      {
        source: 'MNMMMIjjWyMU',
        target: '7BdojPlukIQw',
        sourceHandle: 'MNMMMIjjWyMU-source-right',
        targetHandle: '7BdojPlukIQw-target-left'
      },
      {
        source: 'rvbo634w3AYj',
        target: '7kwgL1dVlwG6',
        sourceHandle: 'rvbo634w3AYj-source-sdfa',
        targetHandle: '7kwgL1dVlwG6-target-left'
      }
    ]
  }
];

export const pluginTemplates: TemplateType = [
  {
    id: 'plugin-simple',
    avatar: '/imgs/workflow/AI.png',
    name: '默认模板',
    intro: '标准的插件初始模板',
    type: AppTypeEnum.plugin,
    modules: [
      {
        nodeId: 'pluginInput',
        name: '自定义插件输入',
        avatar: '/imgs/workflow/input.png',
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
        name: '自定义插件输出',
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
      }
    ],
    edges: []
  },
  {
    id: 'plugin-feishu',
    avatar: '/imgs/app/templates/feishu.svg',
    name: '飞书webhook插件',
    intro: '通过 webhook 给飞书机器人发送一条消息',
    type: AppTypeEnum.plugin,
    modules: [
      {
        nodeId: 'pluginInput',
        name: '自定义插件输入',
        intro: '自定义配置外部输入，使用插件时，仅暴露自定义配置的输入',
        avatar: '/imgs/workflow/input.png',
        flowNodeType: 'pluginInput',
        showStatus: false,
        position: {
          x: 517.5620777851774,
          y: -173.55711888178655
        },
        version: '481',
        inputs: [
          {
            inputType: 'input',
            valueType: 'string',
            key: '飞书机器人地址',
            label: '飞书机器人地址',
            description: '',
            isToolInput: false,
            defaultValue: '',
            editField: {
              key: true
            },
            dynamicParamDefaultValue: {
              inputType: 'reference',
              valueType: 'string',
              required: true
            },
            renderTypeList: ['input'],
            required: true,
            canEdit: true,
            value: ''
          },
          {
            key: '发送的消息',
            valueType: 'string',
            label: '发送的消息',
            renderTypeList: ['reference'],
            required: true,
            description: '',
            canEdit: true,
            value: '',
            editField: {
              key: true
            },
            dynamicParamDefaultValue: {
              inputType: 'reference',
              valueType: 'string',
              required: true
            }
          }
        ],
        outputs: [
          {
            id: 'mv52BrPVE6bm',
            key: '飞书机器人地址',
            valueType: 'string',
            label: '飞书机器人地址',
            type: 'static'
          },
          {
            id: 'p0m68Dv5KaIp',
            key: '发送的消息',
            valueType: 'string',
            label: '发送的消息',
            type: 'static'
          }
        ]
      },
      {
        nodeId: 'pluginOutput',
        name: '自定义插件输出',
        intro: '自定义配置外部输出，使用插件时，仅暴露自定义配置的输出',
        avatar: '/imgs/workflow/output.png',
        flowNodeType: 'pluginOutput',
        showStatus: false,
        position: {
          x: 1668.9410524554828,
          y: -153.47815316221283
        },
        version: '481',
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'rKBYGQuYefae',
        name: 'HTTP 请求',
        intro: '可以发出一个 HTTP 请求，实现更为复杂的操作（联网搜索、数据库查询等）',
        avatar: '/imgs/workflow/http.png',
        flowNodeType: 'httpRequest468',
        showStatus: true,
        position: {
          x: 1069.7228495148624,
          y: -392.26482361861054
        },
        version: '481',
        inputs: [
          {
            key: 'system_addInputParam',
            renderTypeList: ['addInputParam'],
            valueType: 'dynamic',
            label: '',
            required: false,
            description: 'core.module.input.description.HTTP Dynamic Input',
            editField: {
              key: true,
              valueType: true
            }
          },
          {
            key: 'text',
            valueType: 'string',
            label: 'text',
            renderTypeList: ['reference'],
            description: '',
            canEdit: true,
            editField: {
              key: true,
              valueType: true
            },
            value: ['pluginInput', 'p0m68Dv5KaIp']
          },
          {
            key: 'url',
            valueType: 'string',
            label: 'url',
            renderTypeList: ['reference'],
            description: '',
            canEdit: true,
            editField: {
              key: true,
              valueType: true
            },
            value: ['pluginInput', 'mv52BrPVE6bm']
          },
          {
            key: 'system_httpMethod',
            renderTypeList: ['custom'],
            valueType: 'string',
            label: '',
            value: 'POST',
            required: true
          },
          {
            key: 'system_httpReqUrl',
            renderTypeList: ['hidden'],
            valueType: 'string',
            label: '',
            description: 'core.module.input.description.Http Request Url',
            placeholder: 'https://api.ai.com/getInventory',
            required: false,
            value: '{{url}}'
          },
          {
            key: 'system_httpHeader',
            renderTypeList: ['custom'],
            valueType: 'any',
            value: [],
            label: '',
            description: 'core.module.input.description.Http Request Header',
            placeholder: 'core.module.input.description.Http Request Header',
            required: false
          },
          {
            key: 'system_httpParams',
            renderTypeList: ['hidden'],
            valueType: 'any',
            value: [],
            label: '',
            required: false
          },
          {
            key: 'system_httpJsonBody',
            renderTypeList: ['hidden'],
            valueType: 'any',
            value:
              '{\r\n    "msg_type": "text",\r\n    "content": {\r\n        "text": "{{text}}"\r\n    }\r\n}',
            label: '',
            required: false
          }
        ],
        outputs: [
          {
            id: 'system_addOutputParam',
            key: 'system_addOutputParam',
            type: 'dynamic',
            valueType: 'dynamic',
            label: '',
            editField: {
              key: true,
              valueType: true
            }
          },
          {
            id: 'error',
            key: 'error',
            label: '请求错误',
            description: 'HTTP请求错误信息，成功时返回空',
            valueType: 'object',
            type: 'static'
          },
          {
            id: 'httpRawResponse',
            key: 'httpRawResponse',
            label: '原始响应',
            required: true,
            description: 'HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。',
            valueType: 'any',
            type: 'static'
          }
        ]
      }
    ],
    edges: [
      {
        source: 'pluginInput',
        target: 'rKBYGQuYefae',
        sourceHandle: 'pluginInput-source-right',
        targetHandle: 'rKBYGQuYefae-target-left'
      },
      {
        source: 'rKBYGQuYefae',
        target: 'pluginOutput',
        sourceHandle: 'rKBYGQuYefae-source-right',
        targetHandle: 'pluginOutput-target-left'
      }
    ]
  }
];

export const defaultAppTemplates = [
  simpleBotTemplates[0],
  simpleBotTemplates[1],
  workflowTemplates[0],
  workflowTemplates[1]
];
