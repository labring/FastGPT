import { AppItemType } from '@/types/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

// template
export const appTemplates: (AppItemType & {
  avatar: string;
  intro: string;
  type: `${AppTypeEnum}`;
})[] = [
  {
    id: 'simpleChat',
    avatar: '/imgs/module/AI.png',
    name: '简单的对话',
    intro: '一个极其简单的 AI 对话应用',
    type: AppTypeEnum.simple,
    modules: [
      {
        moduleId: 'userGuide',
        name: '用户引导',
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
            label: '开场白',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'variables',
            type: 'hidden',
            valueType: 'any',
            label: '对话框变量',
            value: [],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            type: 'switch',
            label: '问题引导',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'tts',
            type: 'hidden',
            valueType: 'any',
            label: '语音播报',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: []
      },
      {
        moduleId: 'userChatInput',
        name: '用户问题(对话入口)',
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
            label: '用户问题',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: '用户问题',
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
            type: 'selectChatModel',
            label: '对话模型',
            required: true,
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo-16k',
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
            label: '系统提示词',
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
    id: 'simpleDatasetChat',
    avatar: '/imgs/module/db.png',
    name: '知识库 + 对话引导',
    intro: '每次提问时进行一次知识库搜索，将搜索结果注入 LLM 模型进行参考回答',
    type: AppTypeEnum.simple,
    modules: [
      {
        moduleId: 'userGuide',
        name: '用户引导',
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
            label: '开场白',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: '你好，我是知识库助手，请不要忘记选择知识库噢~\n[你是谁]\n[如何使用]',
            connected: false
          },
          {
            key: 'variables',
            type: 'hidden',
            valueType: 'any',
            label: '对话框变量',
            value: [],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            type: 'switch',
            label: '问题引导',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: false,
            connected: false
          },
          {
            key: 'tts',
            type: 'hidden',
            valueType: 'any',
            label: '语音播报',
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
        name: '用户问题(对话入口)',
        avatar: '/imgs/module/userChatInput.png',
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
            label: '用户问题',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: '用户问题',
            type: 'source',
            valueType: 'string',
            targets: [
              {
                moduleId: 'datasetSearch',
                key: 'userChatInput'
              },
              {
                moduleId: 'chatModule',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'datasetSearch',
        name: '知识库搜索',
        avatar: '/imgs/module/db.png',
        flowType: 'datasetSearchNode',
        showStatus: true,
        position: {
          x: 1351.5043753345153,
          y: 947.0780385418003
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
            key: 'datasets',
            type: 'selectDataset',
            label: '关联的知识库',
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
            type: 'hidden',
            label: '最低相关性',
            value: 0.4,
            valueType: 'number',
            min: 0,
            max: 1,
            step: 0.01,
            markList: [
              {
                label: '0',
                value: 0
              },
              {
                label: '1',
                value: 1
              }
            ],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'limit',
            type: 'hidden',
            label: '引用上限',
            description: '单次搜索最大的 Tokens 数量，中文约1字=1.7Tokens，英文约1字=1Tokens',
            value: 1500,
            valueType: 'number',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'searchMode',
            type: 'hidden',
            label: 'core.dataset.search.Mode',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'embedding',
            connected: false
          },
          {
            key: 'datasetParamsModal',
            type: 'selectDatasetParamsModal',
            label: '',
            valueType: 'any',
            showTargetInApp: false,
            showTargetInPlugin: false,
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
            key: 'isEmpty',
            label: '搜索结果为空',
            type: 'source',
            valueType: 'boolean',
            targets: []
          },
          {
            key: 'unEmpty',
            label: '搜索结果不为空',
            type: 'source',
            valueType: 'boolean',
            targets: []
          },
          {
            key: 'quoteQA',
            label: '引用内容',
            description:
              '始终返回数组，如果希望搜索结果为空时执行额外操作，需要用到上面的两个输入以及目标模块的触发器',
            type: 'source',
            valueType: 'datasetQuote',
            targets: [
              {
                moduleId: 'chatModule',
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
      },
      {
        moduleId: 'chatModule',
        name: 'AI 对话',
        avatar: '/imgs/module/AI.png',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 2022.7264786978908,
          y: 1006.3102431257475
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
            type: 'selectChatModel',
            label: '对话模型',
            required: true,
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo-16k',
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
            value: '',
            connected: false
          },
          {
            key: 'quotePrompt',
            type: 'hidden',
            label: '引用内容提示词',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: '',
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
            label: '系统提示词',
            max: 300,
            valueType: 'string',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
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
            key: 'quoteQA',
            type: 'target',
            label: '引用内容',
            description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
            valueType: 'datasetQuote',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
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
        name: '用户引导',
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
            label: '开场白',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: '你好，我可以为你翻译各种语言，请告诉我你需要翻译成什么语言？',
            connected: false
          },
          {
            key: 'variables',
            type: 'hidden',
            valueType: 'any',
            label: '对话框变量',
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
            label: '问题引导',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: false,
            connected: false
          },
          {
            key: 'tts',
            type: 'hidden',
            valueType: 'any',
            label: '语音播报',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: []
      },
      {
        moduleId: 'userChatInput',
        name: '用户问题(对话入口)',
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
            label: '用户问题',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: '用户问题',
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
            type: 'selectChatModel',
            label: '对话模型',
            required: true,
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo-16k',
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
            label: '系统提示词',
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
    id: 'CQ',
    avatar: '/imgs/module/cq.png',
    name: '问题分类 + 知识库',
    intro: '先对用户的问题进行分类，再根据不同类型问题，执行不同的操作',
    type: AppTypeEnum.advanced,
    modules: [
      {
        moduleId: '7z5g5h',
        name: '用户问题(对话入口)',
        avatar: '/imgs/module/userChatInput.png',
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
            label: '用户问题',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: '用户问题',
            type: 'source',
            valueType: 'string',
            targets: [
              {
                moduleId: '79iwqi',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'remuj3',
        name: '问题分类',
        avatar: '/imgs/module/cq.png',
        flowType: 'classifyQuestion',
        showStatus: true,
        position: {
          x: 730.6899384278805,
          y: 1079.2201234653105
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
            type: 'selectCQModel',
            valueType: 'string',
            label: '分类模型',
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
            label: '背景知识',
            description:
              '你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。',
            placeholder:
              '例如: \n1. AIGC（人工智能生成内容）是指使用人工智能技术自动或半自动地生成数字内容，如文本、图像、音乐、视频等。\n2. AIGC技术包括但不限于自然语言处理、计算机视觉、机器学习和深度学习。这些技术可以创建新内容或修改现有内容，以满足特定的创意、教育、娱乐或信息需求。',
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
            type: 'target',
            label: 'core.module.input.label.user question',
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
          }
        ]
      },
      {
        moduleId: 'a99p6z',
        name: '指定回复',
        avatar: '/imgs/module/reply.png',
        flowType: 'answerNode',
        position: {
          x: 1294.314623049058,
          y: 1623.9470929531146
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'text',
            type: 'textarea',
            valueType: 'any',
            label: '回复的内容',
            description:
              '可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串',
            placeholder:
              '可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串',
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
        avatar: '/imgs/module/reply.png',
        flowType: 'answerNode',
        position: {
          x: 1290.9284595230658,
          y: 1992.4810074310749
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'text',
            type: 'textarea',
            valueType: 'any',
            label: '回复的内容',
            description:
              '可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串',
            placeholder:
              '可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串',
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
        avatar: '/imgs/module/AI.png',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 2260.436476009152,
          y: 1104.6583548423682
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'model',
            type: 'selectChatModel',
            label: '对话模型',
            required: true,
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo-16k',
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
            label: '系统提示词',
            max: 300,
            valueType: 'string',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
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
            key: 'quoteQA',
            type: 'target',
            label: '引用内容',
            description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
            valueType: 'datasetQuote',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
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
      },
      {
        moduleId: 'fljhzy',
        name: '知识库搜索',
        avatar: '/imgs/module/db.png',
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
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'datasets',
            type: 'selectDataset',
            label: '关联的知识库',
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
            type: 'hidden',
            label: '最低相关性',
            value: 0.76,
            valueType: 'number',
            min: 0,
            max: 1,
            step: 0.01,
            markList: [
              {
                label: '0',
                value: 0
              },
              {
                label: '1',
                value: 1
              }
            ],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'limit',
            type: 'hidden',
            label: '引用上限',
            description: '单次搜索最大的 Tokens 数量，中文约1字=1.7Tokens，英文约1字=1Tokens',
            value: 1500,
            valueType: 'number',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'searchMode',
            type: 'hidden',
            label: 'core.dataset.search.Mode',
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'embedding',
            connected: false
          },
          {
            key: 'datasetParamsModal',
            type: 'selectDatasetParamsModal',
            label: '',
            valueType: 'any',
            showTargetInApp: false,
            showTargetInPlugin: false,
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
            key: 'isEmpty',
            label: '搜索结果为空',
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
            label: '搜索结果不为空',
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
            label: '引用内容',
            description:
              '始终返回数组，如果希望搜索结果为空时执行额外操作，需要用到上面的两个输入以及目标模块的触发器',
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
          }
        ]
      },
      {
        moduleId: 'q9equb',
        name: '用户引导',
        avatar: '/imgs/module/userGuide.png',
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
            label: '开场白',
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
            label: '对话框变量',
            value: [],
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            type: 'switch',
            label: '问题引导',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'tts',
            type: 'hidden',
            valueType: 'any',
            label: '语音播报',
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
        avatar: '/imgs/module/reply.png',
        flowType: 'answerNode',
        position: {
          x: 2262.720467249169,
          y: 750.6776669274682
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          {
            key: 'text',
            type: 'textarea',
            valueType: 'any',
            label: '回复的内容',
            description:
              '可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串',
            placeholder:
              '可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串',
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
      },
      {
        moduleId: '9act94',
        name: '用户问题(对话入口)',
        avatar: '/imgs/module/userChatInput.png',
        flowType: 'questionInput',
        position: {
          x: 1902.0261451535691,
          y: 1826.2701495060023
        },
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            valueType: 'string',
            label: '用户问题',
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: '用户问题',
            type: 'source',
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
        moduleId: '79iwqi',
        name: 'core.module.template.cfr',
        avatar: '/imgs/module/cfr.svg',
        flowType: 'cfr',
        showStatus: true,
        position: {
          x: 149.7113934317785,
          y: 1312.2668782737812
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
            type: 'selectExtractModel',
            label: 'core.module.input.label.aiModel',
            required: true,
            valueType: 'string',
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: 'gpt-3.5-turbo',
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: 'core.module.input.label.cfr background',
            max: 300,
            valueType: 'string',
            description: 'core.module.input.description.cfr background',
            placeholder: 'core.module.input.placeholder.cfr background',
            showTargetInApp: true,
            showTargetInPlugin: true,
            value: '关于电影《星际穿越》的讨论。',
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
            key: 'system_text',
            label: 'core.module.output.label.cfr result',
            valueType: 'string',
            type: 'source',
            targets: [
              {
                moduleId: 'remuj3',
                key: 'userChatInput'
              },
              {
                moduleId: 'fljhzy',
                key: 'userChatInput'
              }
            ]
          }
        ]
      }
    ]
  }
];
