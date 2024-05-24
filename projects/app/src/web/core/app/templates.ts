import { AppItemType } from '@/types/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

// template
export const appTemplates: (AppItemType & {
  avatar: string;
  intro: string;
  type: `${AppTypeEnum}`;
})[] = [
  {
    id: 'simpleChat',
    avatar: '/imgs/workflow/AI.png',
    name: '简易模板',
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
            type: 'static'
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
            type: 'static'
          },
          {
            id: 'answerText',
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: WorkflowIOValueTypeEnum.string,
            type: 'static'
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
            type: 'static'
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
            type: 'static'
          },
          {
            id: 'answerText',
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: WorkflowIOValueTypeEnum.string,
            type: 'static'
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
            type: 'static'
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
            type: 'static'
          },
          {
            id: 'answerText',
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: WorkflowIOValueTypeEnum.string,
            type: 'static'
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
            type: 'static',
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
    id: 'CQ',
    avatar: '/imgs/workflow/cq.png',
    name: '问题分类 + 知识库',
    intro: '先对用户的问题进行分类，再根据不同类型问题，执行不同的操作',
    type: AppTypeEnum.advanced,
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
            type: 'static'
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
            type: 'static'
          },
          {
            id: 'answerText',
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: WorkflowIOValueTypeEnum.string,
            type: 'static'
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
            type: 'static'
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
            type: 'static',
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
