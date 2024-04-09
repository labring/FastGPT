import { AppItemType } from '@/types/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { Dataset_SEARCH_DESC } from '@fastgpt/global/core/module/template/system/datasetSearch';

// template
export const appTemplates: (AppItemType & {
  avatar: string;
  intro: string;
  type: `${AppTypeEnum}`;
})[] = [
  {
    id: 'simpleChat',
    avatar: '/imgs/module/AI.png',
    name: '简易模板',
    intro: '一个极其简单的 AI 应用，你可以绑定知识库或工具。',
    type: AppTypeEnum.simple,
    modules: [
      {
        moduleId: 'userGuide',
        name: 'core.module.template.App system setting',
        avatar: '/imgs/module/userGuide.png',
        flowType: 'userGuide',
        position: {
          x: 454.98510354678695,
          y: 721.4016845336229
        },
        inputs: [
          {
            key: 'welcomeText',
            type: 'hidden',
            valueType: 'string',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'variables',
            type: 'hidden',
            valueType: 'any',
            label: '',
            value: [],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            type: 'switch',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'tts',
            type: 'hidden',
            valueType: 'any',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: []
      },
      {
        moduleId: 'userChatInput',
        name: 'core.module.template.Chat entrance',
        avatar: '/imgs/module/userChatInput.png',
        flowType: 'questionInput',
        position: {
          x: 464.32198615344566,
          y: 1602.2698463081606
        },
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            valueType: 'string',
            label: 'core.module.input.label.user question',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            type: 'source',
            valueType: 'string',
            targets: [
              {
                moduleId: 'chatModule',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'chatModule',
        name: 'AI 对话',
        avatar: '/imgs/module/AI.png',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 1150.8317145593148,
          y: 957.9676672880053
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'model',
            type: 'selectLLMModel',
            label: 'core.module.input.label.aiModel',
            required: true,
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo',
            connected: false
          },
          {
            key: 'temperature',
            type: 'hidden',
            label: '温度',
            value: 0,
            valueType: 'number',
            min: 0,
            max: 10,
            step: 1,
            markList: [
              {
                label: '严谨',
                value: 0
              },
              {
                label: '发散',
                value: 10
              }
            ],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'maxToken',
            type: 'hidden',
            label: '回复上限',
            value: 8000,
            valueType: 'number',
            min: 100,
            max: 4000,
            step: 50,
            markList: [
              {
                label: '100',
                value: 100
              },
              {
                label: '4000',
                value: 4000
              }
            ],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'isResponseAnswerText',
            type: 'hidden',
            label: '返回AI内容',
            value: true,
            valueType: 'boolean',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'quoteTemplate',
            type: 'hidden',
            label: '引用内容模板',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'quotePrompt',
            type: 'hidden',
            label: '引用内容提示词',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'aiSettings',
            type: 'aiSettings',
            label: '',
            valueType: 'any',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: 'core.ai.Prompt',
            max: 300,
            valueType: 'string',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'history',
            type: 'numberInput',
            label: 'core.module.input.label.chat history',
            required: true,
            min: 0,
            max: 30,
            valueType: 'chatHistory',
            value: 6,
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'quoteQA',
            type: 'target',
            label: '引用内容',
            description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
            valueType: 'datasetQuote',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: 'core.module.input.label.user question',
            required: true,
            valueType: 'string',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          }
        ],
        outputs: [
          {
            key: 'answerText',
            label: 'AI回复',
            description: '将在 stream 回复完毕后触发',
            valueType: 'string',
            type: 'source',
            targets: []
          },
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          },
          {
            key: 'history',
            label: '新的上下文',
            description: '将本次回复内容拼接上历史记录，作为新的上下文返回',
            valueType: 'chatHistory',
            type: 'source',
            targets: []
          }
        ]
      }
    ]
  },
  {
    id: 'chatGuide',
    avatar: '/imgs/module/userGuide.png',
    name: '对话引导 + 变量',
    intro: '可以在对话开始发送一段提示，或者让用户填写一些内容，作为本次对话的变量',
    type: AppTypeEnum.simple,
    modules: [
      {
        moduleId: 'userGuide',
        name: 'core.module.template.App system setting',
        avatar: '/imgs/module/userGuide.png',
        flowType: 'userGuide',
        position: {
          x: 447.98520778293346,
          y: 721.4016845336229
        },
        inputs: [
          {
            key: 'welcomeText',
            type: 'hidden',
            valueType: 'string',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: '你好，我可以为你翻译各种语言，请告诉我你需要翻译成什么语言？',
            connected: false
          },
          {
            key: 'variables',
            type: 'hidden',
            valueType: 'any',
            label: '',
            value: [
              {
                id: '35c640eb-cf22-431f-bb57-3fc21643880e',
                key: 'language',
                label: '目标语言',
                type: 'input',
                required: true,
                maxLen: 50,
                enums: [
                  {
                    value: ''
                  }
                ]
              },
              {
                id: '2011ff08-91aa-4f60-ae69-f311ab4797b3',
                key: 'language2',
                label: '下拉框测试',
                type: 'select',
                required: false,
                maxLen: 50,
                enums: [
                  {
                    value: '英语'
                  },
                  {
                    value: '法语'
                  }
                ]
              }
            ],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            type: 'switch',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: false,
            connected: false
          },
          {
            key: 'tts',
            type: 'hidden',
            valueType: 'any',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: []
      },
      {
        moduleId: 'userChatInput',
        name: 'core.module.template.Chat entrance',
        avatar: '/imgs/module/userChatInput.png',
        flowType: 'questionInput',
        position: {
          x: 464.32198615344566,
          y: 1602.2698463081606
        },
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            valueType: 'string',
            label: 'core.module.input.label.user question',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            type: 'source',
            valueType: 'string',
            targets: [
              {
                moduleId: 'chatModule',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'chatModule',
        name: 'AI 对话',
        avatar: '/imgs/module/AI.png',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 981.9682828103937,
          y: 890.014595014464
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'model',
            type: 'selectLLMModel',
            label: 'core.module.input.label.aiModel',
            required: true,
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo',
            connected: false
          },
          {
            key: 'temperature',
            type: 'hidden',
            label: '温度',
            value: 0,
            valueType: 'number',
            min: 0,
            max: 10,
            step: 1,
            markList: [
              {
                label: '严谨',
                value: 0
              },
              {
                label: '发散',
                value: 10
              }
            ],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'maxToken',
            type: 'hidden',
            label: '回复上限',
            value: 8000,
            valueType: 'number',
            min: 100,
            max: 4000,
            step: 50,
            markList: [
              {
                label: '100',
                value: 100
              },
              {
                label: '4000',
                value: 4000
              }
            ],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'isResponseAnswerText',
            type: 'hidden',
            label: '返回AI内容',
            value: true,
            valueType: 'boolean',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'quoteTemplate',
            type: 'hidden',
            label: '引用内容模板',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'quotePrompt',
            type: 'hidden',
            label: '引用内容提示词',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'aiSettings',
            type: 'aiSettings',
            label: '',
            valueType: 'any',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: 'core.ai.Prompt',
            max: 300,
            valueType: 'string',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            showTargetInApp: true,
            showTargetInPlugin: true,
            value: '请直接将我的问题翻译成{{language}}，不需要回答问题。',
            connected: false
          },
          {
            key: 'history',
            type: 'numberInput',
            label: 'core.module.input.label.chat history',
            required: true,
            min: 0,
            max: 30,
            valueType: 'chatHistory',
            value: 6,
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'quoteQA',
            type: 'target',
            label: '引用内容',
            description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
            valueType: 'datasetQuote',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: 'core.module.input.label.user question',
            required: true,
            valueType: 'string',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          }
        ],
        outputs: [
          {
            key: 'answerText',
            label: 'AI回复',
            description: '将在 stream 回复完毕后触发',
            valueType: 'string',
            type: 'source',
            targets: []
          },
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          },
          {
            key: 'history',
            label: '新的上下文',
            description: '将本次回复内容拼接上历史记录，作为新的上下文返回',
            valueType: 'chatHistory',
            type: 'source',
            targets: []
          }
        ]
      }
    ]
  },
  {
    id: 'simpleDatasetChat',
    avatar: '/imgs/module/db.png',
    name: '知识库+对话引导',
    intro: '每次提问时进行一次知识库搜索，将搜索结果注入 LLM 模型进行参考回答',
    type: AppTypeEnum.advanced,
    modules: [
      {
        moduleId: 'userGuide',
        name: 'core.module.template.App system setting',
        intro: 'core.app.tip.userGuideTip',
        avatar: '/imgs/module/userGuide.png',
        flowType: 'userGuide',
        position: {
          x: 447.98520778293346,
          y: 721.4016845336229
        },
        inputs: [
          {
            key: 'welcomeText',
            type: 'hidden',
            valueType: 'string',
            label: 'core.app.Welcome Text',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: '你好，我是知识库助手，请不要忘记选择知识库噢~\n[你是谁]\n[如何使用]',
            connected: false
          },
          {
            key: 'variables',
            type: 'hidden',
            valueType: 'any',
            label: 'core.module.Variable',
            value: [],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            type: 'switch',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: false,
            connected: false
          },
          {
            key: 'tts',
            type: 'hidden',
            valueType: 'any',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: {
              type: 'web'
            },
            connected: false
          }
        ],
        outputs: []
      },
      {
        moduleId: 'userChatInput',
        name: 'core.module.template.Chat entrance',
        intro: '当用户发送一个内容后，流程将会从这个模块开始执行。',
        avatar: '/imgs/module/userChatInput.svg',
        flowType: 'questionInput',
        position: {
          x: 324.81436595478294,
          y: 1527.0012457753612
        },
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            valueType: 'string',
            label: 'core.module.input.label.user question',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            type: 'source',
            valueType: 'string',
            targets: [
              {
                moduleId: '0voh5n',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: '63toub',
        name: 'AI 对话',
        intro: 'AI 大模型对话',
        avatar: '/imgs/module/AI.png',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 1962.4010270586014,
          y: 1026.9105717680477
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            description: 'core.module.input.description.Trigger',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'model',
            type: 'settingLLMModel',
            label: 'core.module.input.label.aiModel',
            required: true,
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo',
            connected: false
          },
          {
            key: 'temperature',
            type: 'hidden',
            label: '',
            value: 0,
            valueType: 'number',
            min: 0,
            max: 10,
            step: 1,
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'maxToken',
            type: 'hidden',
            label: '',
            value: 2000,
            valueType: 'number',
            min: 100,
            max: 4000,
            step: 50,
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'isResponseAnswerText',
            type: 'hidden',
            label: '',
            value: true,
            valueType: 'boolean',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'quoteTemplate',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'quotePrompt',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            max: 3000,
            valueType: 'string',
            label: 'core.ai.Prompt',
            description: 'core.app.tip.chatNodeSystemPromptTip',
            placeholder: 'core.app.tip.chatNodeSystemPromptTip',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'history',
            type: 'numberInput',
            label: 'core.module.input.label.chat history',
            required: true,
            min: 0,
            max: 30,
            valueType: 'chatHistory',
            value: 6,
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'userChatInput',
            type: 'custom',
            label: '',
            required: true,
            valueType: 'string',
            showTargetInApp: true,
            showTargetInPlugin: true,
            toolDescription: '用户问题',
            connected: true
          },
          {
            key: 'quoteQA',
            type: 'settingDatasetQuotePrompt',
            label: '知识库引用',
            description: 'core.module.Dataset quote.Input description',
            valueType: 'datasetQuote',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            type: 'hidden',
            valueType: 'string',
            targets: []
          },
          {
            key: 'history',
            label: 'core.module.output.label.New context',
            description: 'core.module.output.description.New context',
            valueType: 'chatHistory',
            type: 'source',
            targets: []
          },
          {
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: 'string',
            type: 'source',
            targets: []
          },
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          }
        ]
      },
      {
        moduleId: '0voh5n',
        name: '知识库搜索',
        intro: Dataset_SEARCH_DESC,
        avatar: '/imgs/module/db.png',
        flowType: 'datasetSearchNode',
        showStatus: true,
        position: {
          x: 1098.245668870126,
          y: 1166.7285333032098
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            description: 'core.module.input.description.Trigger',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'datasets',
            type: 'selectDataset',
            label: 'core.module.input.label.Select dataset',
            value: [],
            valueType: 'selectDataset',
            list: [],
            required: true,
            showTargetInApp: false,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'similarity',
            type: 'selectDatasetParamsModal',
            label: '',
            value: 0.4,
            valueType: 'number',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'limit',
            type: 'hidden',
            label: '',
            value: 1500,
            valueType: 'number',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'searchMode',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'embedding',
            connected: false
          },
          {
            key: 'usingReRank',
            type: 'hidden',
            label: '',
            valueType: 'boolean',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: false,
            connected: false
          },
          {
            key: 'datasetSearchUsingExtensionQuery',
            type: 'hidden',
            label: '',
            valueType: 'boolean',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: true,
            connected: false
          },
          {
            key: 'datasetSearchExtensionModel',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'datasetSearchExtensionBg',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: '',
            connected: false
          },
          {
            key: 'userChatInput',
            type: 'custom',
            label: '',
            required: true,
            valueType: 'string',
            showTargetInApp: true,
            showTargetInPlugin: true,
            toolDescription: '需要检索的内容',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            type: 'hidden',
            valueType: 'string',
            targets: [
              {
                moduleId: '63toub',
                key: 'userChatInput'
              }
            ]
          },
          {
            key: 'isEmpty',
            label: 'core.module.output.label.Search result empty',
            type: 'source',
            valueType: 'boolean',
            targets: []
          },
          {
            key: 'unEmpty',
            label: 'core.module.output.label.Search result not empty',
            type: 'source',
            valueType: 'boolean',
            targets: []
          },
          {
            key: 'quoteQA',
            label: 'core.module.Dataset quote.label',
            type: 'source',
            valueType: 'datasetQuote',
            targets: [
              {
                moduleId: '63toub',
                key: 'quoteQA'
              }
            ]
          },
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          }
        ]
      }
    ]
  },
  {
    id: 'CQ',
    avatar: '/imgs/module/cq.png',
    name: '问题分类 + 知识库',
    intro: '先对用户的问题进行分类，再根据不同类型问题，执行不同的操作',
    type: AppTypeEnum.advanced,
    modules: [
      {
        moduleId: '7z5g5h',
        name: 'core.module.template.Chat entrance',
        flowType: 'questionInput',
        position: {
          x: -269.50851681351924,
          y: 1657.6123698022448
        },
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            valueType: 'string',
            label: 'core.module.input.label.user question',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            type: 'source',
            valueType: 'string',
            targets: [
              {
                moduleId: 'remuj3',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'remuj3',
        name: '问题分类',
        flowType: 'classifyQuestion',
        showStatus: true,
        position: {
          x: 446.8376904635288,
          y: 1055.101958605594
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            description: 'core.module.input.description.Trigger',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'model',
            type: 'selectLLMModel',
            valueType: 'string',
            label: 'core.module.input.label.Classify model',
            required: true,
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo',
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            valueType: 'string',
            label: 'core.module.input.label.Background',
            description: 'core.module.input.description.Background',
            placeholder: 'core.module.input.placeholder.Classify background',
            showTargetInApp: true,
            showTargetInPlugin: true,
            value: '',
            connected: false
          },
          {
            key: 'history',
            type: 'numberInput',
            label: 'core.module.input.label.chat history',
            required: true,
            min: 0,
            max: 30,
            valueType: 'chatHistory',
            value: 6,
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'userChatInput',
            type: 'custom',
            label: '',
            required: true,
            valueType: 'string',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'agents',
            type: 'custom',
            valueType: 'any',
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
                key: 'oy1c'
              }
            ],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'wqre',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: 'fljhzy',
                key: 'switch'
              }
            ]
          },
          {
            key: 'sdfa',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: 'a99p6z',
                key: 'switch'
              }
            ]
          },
          {
            key: 'oy1c',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: 'iejcou',
                key: 'switch'
              }
            ]
          },
          {
            key: 'agex',
            label: '',
            type: 'hidden',
            targets: []
          },
          {
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            type: 'hidden',
            valueType: 'string',
            targets: [
              {
                moduleId: 'fljhzy',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'a99p6z',
        name: '指定回复',
        flowType: 'answerNode',
        position: {
          x: 1259.0649974848573,
          y: 1681.4596399262844
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            description: 'core.module.input.description.Trigger',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'text',
            type: 'textarea',
            valueType: 'any',
            label: 'core.module.input.label.Response content',
            description: 'core.module.input.description.Response content',
            placeholder: 'core.module.input.description.Response content',
            showTargetInApp: true,
            showTargetInPlugin: true,
            value: '你好，有什么可以帮助你的？',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          }
        ]
      },
      {
        moduleId: 'iejcou',
        name: '指定回复',
        flowType: 'answerNode',
        position: {
          x: 1294.6389464245608,
          y: 2192.8473001117936
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            description: 'core.module.input.description.Trigger',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'text',
            type: 'textarea',
            valueType: 'any',
            label: 'core.module.input.label.Response content',
            description: 'core.module.input.description.Response content',
            placeholder: 'core.module.input.description.Response content',
            showTargetInApp: true,
            showTargetInPlugin: true,
            value: '你好，我仅能回答电影《星际穿越》相关问题，请问你有什么问题么？',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          }
        ]
      },
      {
        moduleId: 'nlfwkc',
        name: 'AI 对话',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 2043.3729922717066,
          y: 1169.5918756185272
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            description: 'core.module.input.description.Trigger',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'model',
            type: 'selectLLMModel',
            label: 'core.module.input.label.aiModel',
            required: true,
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo',
            connected: false
          },
          {
            key: 'temperature',
            type: 'hidden',
            label: '',
            value: 0,
            valueType: 'number',
            min: 0,
            max: 10,
            step: 1,
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'maxToken',
            type: 'hidden',
            label: '',
            value: 2000,
            valueType: 'number',
            min: 100,
            max: 4000,
            step: 50,
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'isResponseAnswerText',
            type: 'hidden',
            label: '',
            value: true,
            valueType: 'boolean',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'quoteTemplate',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'quotePrompt',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: 'core.ai.Prompt',
            max: 300,
            valueType: 'string',
            description: 'core.app.tip.chatNodeSystemPromptTip',
            placeholder: 'core.app.tip.chatNodeSystemPromptTip',
            showTargetInApp: true,
            showTargetInPlugin: true,
            value: '',
            connected: false
          },
          {
            key: 'history',
            type: 'numberInput',
            label: 'core.module.input.label.chat history',
            required: true,
            min: 0,
            max: 30,
            valueType: 'chatHistory',
            value: 6,
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'userChatInput',
            type: 'custom',
            label: '',
            required: true,
            valueType: 'string',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'quoteQA',
            type: 'target',
            label: '知识库引用',
            description: 'core.module.Dataset quote.Input description',
            valueType: 'datasetQuote',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          }
        ],
        outputs: [
          {
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: 'string',
            type: 'source',
            targets: []
          },
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          },
          {
            key: 'history',
            label: 'core.module.output.label.New context',
            description: 'core.module.output.description.New context',
            valueType: 'chatHistory',
            type: 'source',
            targets: []
          },
          {
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            type: 'hidden',
            valueType: 'string',
            targets: []
          }
        ]
      },
      {
        moduleId: 'fljhzy',
        name: 'core.module.template.Dataset search',
        flowType: 'datasetSearchNode',
        showStatus: true,
        position: {
          x: 1307.1997559129973,
          y: 908.9246215273222
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            description: 'core.module.input.description.Trigger',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'datasets',
            type: 'selectDataset',
            label: 'core.module.input.label.Select dataset',
            value: [],
            valueType: 'selectDataset',
            list: [],
            required: true,
            showTargetInApp: false,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'similarity',
            type: 'selectDatasetParamsModal',
            label: '',
            value: 0.8,
            valueType: 'number',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'limit',
            type: 'hidden',
            label: '',
            value: 1500,
            valueType: 'number',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'searchMode',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'embedding',
            connected: false
          },
          {
            key: 'usingReRank',
            type: 'hidden',
            label: '',
            valueType: 'boolean',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: false,
            connected: false
          },
          {
            key: 'datasetSearchUsingExtensionQuery',
            type: 'hidden',
            label: '',
            valueType: 'boolean',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: true,
            connected: false
          },
          {
            key: 'datasetSearchExtensionModel',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo',
            connected: false
          },
          {
            key: 'datasetSearchExtensionBg',
            type: 'hidden',
            label: '',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: '',
            connected: false
          },
          {
            key: 'userChatInput',
            type: 'custom',
            label: '',
            required: true,
            valueType: 'string',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          }
        ],
        outputs: [
          {
            key: 'isEmpty',
            label: 'core.module.output.label.Search result empty',
            type: 'source',
            valueType: 'boolean',
            targets: [
              {
                moduleId: 'tc90wz',
                key: 'switch'
              }
            ]
          },
          {
            key: 'unEmpty',
            label: 'core.module.output.label.Search result not empty',
            type: 'source',
            valueType: 'boolean',
            targets: [
              {
                moduleId: 'nlfwkc',
                key: 'switch'
              }
            ]
          },
          {
            key: 'quoteQA',
            label: 'core.module.Dataset quote.label',
            type: 'source',
            valueType: 'datasetQuote',
            targets: [
              {
                moduleId: 'nlfwkc',
                key: 'quoteQA'
              }
            ]
          },
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          },
          {
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            type: 'hidden',
            valueType: 'string',
            targets: [
              {
                moduleId: 'nlfwkc',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'q9equb',
        name: 'core.module.template.App system setting',
        flowType: 'userGuide',
        position: {
          x: -272.66416216517086,
          y: 842.9928682053646
        },
        inputs: [
          {
            key: 'welcomeText',
            type: 'hidden',
            valueType: 'string',
            label: 'core.app.Welcome Text',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value:
              '你好，我是电影《星际穿越》 AI 助手，有什么可以帮助你的？\n[导演是谁]\n[剧情介绍]\n[票房分析]',
            connected: false
          },
          {
            key: 'variables',
            type: 'hidden',
            valueType: 'any',
            label: 'core.module.Variable',
            value: [],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            type: 'switch',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'tts',
            type: 'hidden',
            valueType: 'any',
            label: '',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: []
      },
      {
        moduleId: 'tc90wz',
        name: '指定回复',
        flowType: 'answerNode',
        position: {
          x: 1964.026271678838,
          y: 663.4812247423405
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            description: 'core.module.input.description.Trigger',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'text',
            type: 'textarea',
            valueType: 'any',
            label: 'core.module.input.label.Response content',
            description: 'core.module.input.description.Response content',
            placeholder: 'core.module.input.description.Response content',
            showTargetInApp: true,
            showTargetInPlugin: true,
            value: '对不起，我找不到你的问题，请更加详细的描述你的问题。',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          }
        ]
      }
    ]
  }
];
