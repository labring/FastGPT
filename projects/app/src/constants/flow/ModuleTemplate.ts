import { SystemInputEnum } from '../app';
import { TaskResponseKeyEnum } from '../chat';
import {
  FlowModuleTypeEnum,
  FlowInputItemTypeEnum,
  FlowOutputItemTypeEnum,
  SpecialInputKeyEnum,
  FlowValueTypeEnum
} from './index';
import type { AppItemType } from '@/types/app';
import type { FlowModuleTemplateType } from '@/types/core/app/flow';
import { chatModelList } from '@/store/static';
import {
  Input_Template_History,
  Input_Template_TFSwitch,
  Input_Template_UserChatInput
} from './inputTemplate';
import { ContextExtractEnum, HttpPropsEnum } from './flowField';

export const ChatModelSystemTip =
  '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}';
export const ChatModelLimitTip =
  '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。不建议内容太长，会影响上下文，可使用变量，例如 {{language}}。可在文档中找到对应的限定例子';
export const userGuideTip = '可以添加特殊的对话前后引导模块，更好的让用户进行对话';
export const welcomeTextTip =
  '每次对话开始前，发送一个初始内容。支持标准 Markdown 语法，可使用的额外标记:\n[快捷按键]: 用户点击后可以直接发送该问题';
export const variableTip =
  '可以在对话开始前，要求用户填写一些内容作为本轮对话的特定变量。该模块位于开场引导之后。\n变量可以通过 {{变量key}} 的形式注入到其他模块 string 类型的输入中，例如：提示词、限定词等';
export const questionGuideTip = `对话结束后，会为生成 3 个引导性问题。`;

export const VariableModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.variable,
  logo: '/imgs/module/variable.png',
  name: '全局变量',
  intro: variableTip,
  description:
    '全局变量可以通过 {{变量key}} 的形式注入到其他模块 string 类型的输入中，例如：提示词、限定词等',
  inputs: [
    {
      key: SystemInputEnum.variables,
      type: FlowInputItemTypeEnum.systemInput,
      label: '变量输入',
      value: []
    }
  ],
  outputs: []
};
export const UserGuideModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.userGuide,
  logo: '/imgs/module/userGuide.png',
  name: '用户引导',
  intro: userGuideTip,
  inputs: [
    {
      key: SystemInputEnum.welcomeText,
      type: FlowInputItemTypeEnum.hidden,
      label: '开场白'
    },
    {
      key: SystemInputEnum.variables,
      type: FlowInputItemTypeEnum.hidden,
      label: '对话框变量',
      value: []
    },
    {
      key: SystemInputEnum.questionGuide,
      type: FlowInputItemTypeEnum.switch,
      label: '问题引导'
    }
  ],
  outputs: []
};
export const UserInputModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.questionInput,
  logo: '/imgs/module/userChatInput.png',
  name: '用户问题(对话入口)',
  intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
  inputs: [
    {
      key: SystemInputEnum.userChatInput,
      type: FlowInputItemTypeEnum.systemInput,
      label: '用户问题'
    }
  ],
  outputs: [
    {
      key: SystemInputEnum.userChatInput,
      label: '用户问题',
      type: FlowOutputItemTypeEnum.source,
      valueType: FlowValueTypeEnum.string,
      targets: []
    }
  ]
};
export const HistoryModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.historyNode,
  logo: '/imgs/module/history.png',
  name: '聊天记录',
  intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
  inputs: [
    {
      key: 'maxContext',
      type: FlowInputItemTypeEnum.numberInput,
      label: '最长记录数',
      value: 6,
      min: 0,
      max: 50
    },
    {
      key: SystemInputEnum.history,
      type: FlowInputItemTypeEnum.hidden,
      label: '聊天记录'
    }
  ],
  outputs: [
    {
      key: SystemInputEnum.history,
      label: '聊天记录',
      valueType: FlowValueTypeEnum.chatHistory,
      type: FlowOutputItemTypeEnum.source,
      targets: []
    }
  ]
};

export const ChatModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.chatNode,
  logo: '/imgs/module/AI.png',
  name: 'AI 对话',
  intro: 'AI 大模型对话',
  showStatus: true,
  inputs: [
    {
      key: 'model',
      type: FlowInputItemTypeEnum.custom,
      label: '对话模型',
      value: chatModelList[0]?.model,
      list: chatModelList.map((item) => ({ label: item.name, value: item.model }))
    },
    {
      key: 'temperature',
      type: FlowInputItemTypeEnum.slider,
      label: '温度',
      value: 0,
      min: 0,
      max: 10,
      step: 1,
      markList: [
        { label: '严谨', value: 0 },
        { label: '发散', value: 10 }
      ]
    },
    {
      key: 'maxToken',
      type: FlowInputItemTypeEnum.custom,
      label: '回复上限',
      value: chatModelList[0] ? chatModelList[0].contextMaxToken / 2 : 2000,
      min: 100,
      max: chatModelList[0]?.contextMaxToken || 4000,
      step: 50,
      markList: [
        { label: '100', value: 100 },
        {
          label: `${chatModelList[0]?.contextMaxToken || 4000}`,
          value: chatModelList[0]?.contextMaxToken || 4000
        }
      ]
    },
    {
      key: 'systemPrompt',
      type: FlowInputItemTypeEnum.textarea,
      label: '系统提示词',
      max: 300,
      valueType: FlowValueTypeEnum.string,
      description: ChatModelSystemTip,
      placeholder: ChatModelSystemTip,
      value: ''
    },
    {
      key: 'quoteTemplate',
      type: FlowInputItemTypeEnum.hidden,
      label: '引用内容模板',
      valueType: FlowValueTypeEnum.string,
      value: ''
    },
    {
      key: 'quotePrompt',
      type: FlowInputItemTypeEnum.hidden,
      label: '引用内容提示词',
      valueType: FlowValueTypeEnum.string,
      value: ''
    },
    Input_Template_TFSwitch,
    {
      key: 'quoteQA',
      type: FlowInputItemTypeEnum.custom,
      label: '引用内容',
      description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
      valueType: FlowValueTypeEnum.kbQuote,
      connected: false
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      key: TaskResponseKeyEnum.answerText,
      label: '模型回复',
      description: '将在 stream 回复完毕后触发',
      valueType: FlowValueTypeEnum.string,
      type: FlowOutputItemTypeEnum.source,
      targets: []
    },
    {
      key: 'finish',
      label: '回复结束',
      description: 'AI 回复完成后触发',
      valueType: FlowValueTypeEnum.boolean,
      type: FlowOutputItemTypeEnum.source,
      targets: []
    }
  ]
};

export const KBSearchModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.kbSearchNode,
  logo: '/imgs/module/db.png',
  name: '知识库搜索',
  intro: '去知识库中搜索对应的答案。可作为 AI 对话引用参考。',
  showStatus: true,
  inputs: [
    {
      key: 'kbList',
      type: FlowInputItemTypeEnum.custom,
      label: '关联的知识库',
      value: [],
      list: []
    },
    {
      key: 'similarity',
      type: FlowInputItemTypeEnum.slider,
      label: '相似度',
      value: 0.4,
      min: 0,
      max: 1,
      step: 0.01,
      markList: [
        { label: '100', value: 100 },
        { label: '1', value: 1 }
      ]
    },
    {
      key: 'limit',
      type: FlowInputItemTypeEnum.slider,
      label: '单次搜索上限',
      description: '最多取 n 条记录作为本次问题引用',
      value: 5,
      min: 1,
      max: 20,
      step: 1,
      markList: [
        { label: '1', value: 1 },
        { label: '20', value: 20 }
      ]
    },
    Input_Template_TFSwitch,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      key: 'isEmpty',
      label: '搜索结果为空',
      type: FlowOutputItemTypeEnum.source,
      valueType: FlowValueTypeEnum.boolean,
      targets: []
    },
    {
      key: 'unEmpty',
      label: '搜索结果不为空',
      type: FlowOutputItemTypeEnum.source,
      valueType: FlowValueTypeEnum.boolean,
      targets: []
    },
    {
      key: 'quoteQA',
      label: '引用内容',
      description:
        '始终返回数组，如果希望搜索结果为空时执行额外操作，需要用到上面的两个输入以及目标模块的触发器',
      type: FlowOutputItemTypeEnum.source,
      valueType: FlowValueTypeEnum.kbQuote,
      targets: []
    }
  ]
};

export const AnswerModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.answerNode,
  logo: '/imgs/module/reply.png',
  name: '指定回复',
  intro: '该模块可以直接回复一段指定的内容。常用于引导、提示',
  description: '该模块可以直接回复一段指定的内容。常用于引导、提示',
  inputs: [
    Input_Template_TFSwitch,
    {
      key: SpecialInputKeyEnum.answerText,
      type: FlowInputItemTypeEnum.textarea,
      valueType: FlowValueTypeEnum.string,
      value: '',
      label: '回复的内容',
      description:
        '可以使用 \\n 来实现连续换行。\n\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容'
    }
  ],
  outputs: [
    {
      key: 'finish',
      label: '回复结束',
      description: '回复完成后触发',
      valueType: FlowValueTypeEnum.boolean,
      type: FlowOutputItemTypeEnum.source,
      targets: []
    }
  ]
};
export const ClassifyQuestionModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.classifyQuestion,
  logo: '/imgs/module/cq.png',
  name: '问题分类',
  intro: '可以判断用户问题属于哪方面问题，从而执行不同的操作。',
  description:
    '根据用户的历史记录和当前问题判断该次提问的类型。可以添加多组问题类型，下面是一个模板例子：\n类型1: 打招呼\n类型2: 关于 laf 通用问题\n类型3: 关于 laf 代码问题\n类型4: 其他问题',
  showStatus: true,
  inputs: [
    Input_Template_TFSwitch,
    {
      key: 'systemPrompt',
      type: FlowInputItemTypeEnum.textarea,
      valueType: FlowValueTypeEnum.string,
      value: '',
      label: '系统提示词',
      description:
        '你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。',
      placeholder: '例如: \n1. Laf 是一个云函数开发平台……\n2. Sealos 是一个集群操作系统'
    },
    Input_Template_History,
    Input_Template_UserChatInput,
    {
      key: SpecialInputKeyEnum.agents,
      type: FlowInputItemTypeEnum.custom,
      label: '',
      value: [
        {
          value: '打招呼',
          key: 'fasw'
        },
        {
          value: '关于 xxx 的问题',
          key: 'fqsw'
        },
        {
          value: '其他问题',
          key: 'fesw'
        }
      ]
    }
  ],
  outputs: [
    {
      key: 'fasw',
      label: '',
      type: FlowOutputItemTypeEnum.hidden,
      targets: []
    },
    {
      key: 'fqsw',
      label: '',
      type: FlowOutputItemTypeEnum.hidden,
      targets: []
    },
    {
      key: 'fesw',
      label: '',
      type: FlowOutputItemTypeEnum.hidden,
      targets: []
    }
  ]
};
export const ContextExtractModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.contentExtract,
  logo: '/imgs/module/extract.png',
  name: '文本内容提取',
  intro: '从文本中提取出指定格式的数据',
  description: '可从文本中提取指定的数据，例如：sql语句、搜索关键词、代码等',
  showStatus: true,
  inputs: [
    Input_Template_TFSwitch,
    {
      key: ContextExtractEnum.description,
      type: FlowInputItemTypeEnum.textarea,
      valueType: FlowValueTypeEnum.string,
      value: '',
      label: '提取要求描述',
      description: '写一段提取要求，告诉 AI 需要提取哪些内容',
      required: true,
      placeholder: '例如: \n1. 你是一个实验室预约助手。根据用户问题，提取出姓名、实验室号和预约时间'
    },
    Input_Template_History,
    {
      key: ContextExtractEnum.content,
      type: FlowInputItemTypeEnum.target,
      label: '需要提取的文本',
      required: true,
      valueType: FlowValueTypeEnum.string
    },
    {
      key: ContextExtractEnum.extractKeys,
      type: FlowInputItemTypeEnum.custom,
      label: '目标字段',
      description: "由 '描述' 和 'key' 组成一个目标字段，可提取多个目标字段",
      value: []
    }
  ],
  outputs: [
    {
      key: ContextExtractEnum.success,
      label: '字段完全提取',
      valueType: FlowValueTypeEnum.boolean,
      type: FlowOutputItemTypeEnum.source,
      targets: []
    },
    {
      key: ContextExtractEnum.failed,
      label: '提取字段缺失',
      valueType: FlowValueTypeEnum.boolean,
      type: FlowOutputItemTypeEnum.source,
      targets: []
    },
    {
      key: ContextExtractEnum.fields,
      label: '完整提取结果',
      description: '一个 JSON 字符串，例如：{"name:":"YY","Time":"2023/7/2 18:00"}',
      valueType: FlowValueTypeEnum.string,
      type: FlowOutputItemTypeEnum.source,
      targets: []
    }
  ]
};
export const HttpModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.httpRequest,
  logo: '/imgs/module/http.png',
  name: 'HTTP模块',
  intro: '可以发出一个 HTTP POST 请求，实现更为复杂的操作（联网搜索、数据库查询等）',
  description: '可以发出一个 HTTP POST 请求，实现更为复杂的操作（联网搜索、数据库查询等）',
  showStatus: true,
  inputs: [
    {
      key: HttpPropsEnum.url,
      value: '',
      type: FlowInputItemTypeEnum.input,
      label: '请求地址',
      description: '请求目标地址',
      placeholder: 'https://api.fastgpt.run/getInventory',
      required: true
    },
    Input_Template_TFSwitch
  ],
  outputs: [
    {
      key: HttpPropsEnum.finish,
      label: '请求结束',
      valueType: FlowValueTypeEnum.boolean,
      type: FlowOutputItemTypeEnum.source,
      targets: []
    }
  ]
};
export const EmptyModule: FlowModuleTemplateType = {
  flowType: FlowModuleTypeEnum.empty,
  logo: '/imgs/module/cq.png',
  name: '该模块已被移除',
  intro: '',
  description: '',
  inputs: [],
  outputs: []
};

export const ModuleTemplates = [
  {
    label: '输入模块',
    list: [UserInputModule, HistoryModule]
  },
  {
    label: '引导模块',
    list: [UserGuideModule]
  },
  {
    label: '内容生成',
    list: [ChatModule, AnswerModule]
  },
  {
    label: '知识库模块',
    list: [KBSearchModule]
  },
  {
    label: 'Agent',
    list: [ClassifyQuestionModule, ContextExtractModule, HttpModule]
  }
];
export const ModuleTemplatesFlat = [
  VariableModule,
  UserGuideModule,
  UserInputModule,
  HistoryModule,
  ChatModule,
  KBSearchModule,
  AnswerModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule,
  EmptyModule
];

// template
export const appTemplates: (AppItemType & { avatar: string; intro: string })[] = [
  {
    id: 'simpleChat',
    avatar: '/imgs/module/AI.png',
    name: '简单的对话',
    intro: '一个极其简单的 AI 对话应用',
    modules: [
      {
        moduleId: 'userChatInput',
        name: '用户问题(对话入口)',
        flowType: 'questionInput',
        position: {
          x: 464.32198615344566,
          y: 1602.2698463081606
        },
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            label: '用户问题',
            connected: true
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
        moduleId: 'history',
        name: '聊天记录',
        flowType: 'historyNode',
        position: {
          x: 452.5466249541586,
          y: 1276.3930310334215
        },
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 6,
            min: 0,
            max: 50,
            connected: true
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            valueType: 'chat_history',
            type: 'source',
            targets: [
              {
                moduleId: 'chatModule',
                key: 'history'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'chatModule',
        name: 'AI 对话',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 1150.8317145593148,
          y: 957.9676672880053
        },
        inputs: [
          {
            key: 'model',
            type: 'custom',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [],
            connected: true
          },
          {
            key: 'temperature',
            type: 'slider',
            label: '温度',
            value: 0,
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
            connected: true
          },
          {
            key: 'maxToken',
            type: 'custom',
            label: '回复上限',
            value: 8000,
            min: 100,
            max: 16000,
            step: 50,
            markList: [
              {
                label: '100',
                value: 100
              },
              {
                label: '16000',
                value: 16000
              }
            ],
            connected: true
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            valueType: 'string',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            value: '',
            connected: true
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: false
          },
          {
            key: 'quoteQA',
            type: 'target',
            label: '引用内容',
            valueType: 'kb_quote',
            connected: false
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            valueType: 'chat_history',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            required: true,
            valueType: 'string',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'answerText',
            label: '模型回复',
            description: '直接响应，无需配置',
            type: 'hidden',
            targets: []
          },
          {
            key: 'finish',
            label: '回复结束',
            description: 'AI 回复完成后触发',
            valueType: 'boolean',
            type: 'source',
            targets: []
          }
        ]
      }
    ]
  },
  {
    id: 'simpleKbChat',
    avatar: '/imgs/module/db.png',
    name: '知识库 + 对话引导',
    intro: '每次提问时进行一次知识库搜索，将搜索结果注入 LLM 模型进行参考回答',
    modules: [
      {
        moduleId: 'userGuide',
        name: '用户引导',
        flowType: 'userGuide',
        position: {
          x: 454.98510354678695,
          y: 721.4016845336229
        },
        inputs: [
          {
            key: 'welcomeText',
            type: 'input',
            label: '开场白',
            value: '你好，我是 laf 助手，有什么可以帮助你的么？',
            connected: true
          }
        ],
        outputs: []
      },
      {
        moduleId: 'userChatInput',
        name: '用户问题(对话入口)',
        flowType: 'questionInput',
        position: {
          x: 464.32198615344566,
          y: 1602.2698463081606
        },
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            label: '用户问题',
            connected: true
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
              },
              {
                moduleId: 'kbSearch',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'history',
        name: '聊天记录',
        flowType: 'historyNode',
        position: {
          x: 452.5466249541586,
          y: 1276.3930310334215
        },
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 6,
            min: 0,
            max: 50,
            connected: true
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            valueType: 'chat_history',
            type: 'source',
            targets: [
              {
                moduleId: 'chatModule',
                key: 'history'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'kbSearch',
        name: '知识库搜索',
        flowType: 'kbSearchNode',
        showStatus: true,
        position: {
          x: 956.0838440206068,
          y: 887.462827870246
        },
        inputs: [
          {
            key: 'kbList',
            type: 'custom',
            label: '关联的知识库',
            value: [],
            list: [],
            connected: true
          },
          {
            key: 'similarity',
            type: 'slider',
            label: '相似度',
            value: 0.4,
            min: 0,
            max: 1,
            step: 0.01,
            markList: [
              {
                label: '100',
                value: 100
              },
              {
                label: '1',
                value: 1
              }
            ],
            connected: true
          },
          {
            key: 'limit',
            type: 'slider',
            label: '单次搜索上限',
            description: '最多取 n 条记录作为本次问题引用',
            value: 5,
            min: 1,
            max: 20,
            step: 1,
            markList: [
              {
                label: '1',
                value: 1
              },
              {
                label: '20',
                value: 20
              }
            ],
            connected: true
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: false
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            required: true,
            valueType: 'string',
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
                moduleId: '2752oj',
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
                moduleId: 'chatModule',
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
            valueType: 'kb_quote',
            targets: [
              {
                moduleId: 'chatModule',
                key: 'quoteQA'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'chatModule',
        name: 'AI 对话',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 1546.0823206390796,
          y: 1008.9827344021824
        },
        inputs: [
          {
            key: 'model',
            type: 'custom',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [],
            connected: true
          },
          {
            key: 'temperature',
            type: 'slider',
            label: '温度',
            value: 0,
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
            connected: true
          },
          {
            key: 'maxToken',
            type: 'custom',
            label: '回复上限',
            value: 8000,
            min: 100,
            max: 16000,
            step: 50,
            markList: [
              {
                label: '100',
                value: 100
              },
              {
                label: '16000',
                value: 16000
              }
            ],
            connected: true
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            valueType: 'string',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            value: '',
            connected: true
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: true
          },
          {
            key: 'quoteQA',
            type: 'target',
            label: '引用内容',
            valueType: 'kb_quote',
            connected: true
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            valueType: 'chat_history',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            required: true,
            valueType: 'string',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'answerText',
            label: '模型回复',
            description: '直接响应，无需配置',
            type: 'hidden',
            targets: []
          },
          {
            key: 'finish',
            label: '回复结束',
            description: 'AI 回复完成后触发',
            valueType: 'boolean',
            type: 'source',
            targets: []
          }
        ]
      },
      {
        moduleId: '2752oj',
        name: '指定回复',
        flowType: 'answerNode',
        position: {
          x: 1542.9271243684725,
          y: 702.7819618017722
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: true
          },
          {
            key: 'text',
            value: '搜索结果为空',
            type: 'textarea',
            valueType: 'string',
            label: '回复的内容',
            description:
              '可以使用 \\n 来实现换行。也可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容',
            connected: true
          }
        ],
        outputs: []
      }
    ]
  },
  {
    id: 'chatGuide',
    avatar: '/imgs/module/userGuide.png',
    name: '对话引导 + 变量',
    intro: '可以在对话开始发送一段提示，或者让用户填写一些内容，作为本次对话的变量',
    modules: [
      {
        moduleId: 'userGuide',
        name: '用户引导',
        flowType: 'userGuide',
        position: {
          x: 447.98520778293346,
          y: 721.4016845336229
        },
        inputs: [
          {
            key: 'welcomeText',
            type: 'input',
            label: '开场白',
            value: '你好，我可以为你翻译各种语言，请告诉我你需要翻译成什么语言？',
            connected: true
          }
        ],
        outputs: []
      },
      {
        moduleId: 'variable',
        name: '全局变量',
        flowType: 'variable',
        position: {
          x: 444.0369195277651,
          y: 1008.5185781784537
        },
        inputs: [
          {
            key: 'variables',
            type: 'systemInput',
            label: '变量输入',
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
            connected: true
          }
        ],
        outputs: []
      },
      {
        moduleId: 'userChatInput',
        name: '用户问题(对话入口)',
        flowType: 'questionInput',
        position: {
          x: 464.32198615344566,
          y: 1602.2698463081606
        },
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            label: '用户问题',
            connected: true
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
        moduleId: 'history',
        name: '聊天记录',
        flowType: 'historyNode',
        position: {
          x: 452.5466249541586,
          y: 1276.3930310334215
        },
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 10,
            min: 0,
            max: 50,
            connected: true
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            valueType: 'chat_history',
            type: 'source',
            targets: [
              {
                moduleId: 'chatModule',
                key: 'history'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'chatModule',
        name: 'AI 对话',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 981.9682828103937,
          y: 890.014595014464
        },
        inputs: [
          {
            key: 'model',
            type: 'custom',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [],
            connected: true
          },
          {
            key: 'temperature',
            type: 'slider',
            label: '温度',
            value: 0,
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
            connected: true
          },
          {
            key: 'maxToken',
            type: 'custom',
            label: '回复上限',
            value: 8000,
            min: 100,
            max: 16000,
            step: 50,
            markList: [
              {
                label: '100',
                value: 100
              },
              {
                label: '16000',
                value: 16000
              }
            ],
            connected: true
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            valueType: 'string',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            value: '',
            connected: true
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: false
          },
          {
            key: 'quoteQA',
            type: 'target',
            label: '引用内容',
            valueType: 'kb_quote',
            connected: false
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            valueType: 'chat_history',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            required: true,
            valueType: 'string',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'answerText',
            label: '模型回复',
            description: '直接响应，无需配置',
            type: 'hidden',
            targets: []
          },
          {
            key: 'finish',
            label: '回复结束',
            description: 'AI 回复完成后触发',
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
    modules: [
      {
        moduleId: '7z5g5h',
        name: '用户问题(对话入口)',
        flowType: 'questionInput',
        position: {
          x: 198.56612928723575,
          y: 1622.7034463081607
        },
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            label: '用户问题',
            connected: true
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
                moduleId: 'remuj3',
                key: 'userChatInput'
              },
              {
                moduleId: 'nlfwkc',
                key: 'userChatInput'
              },
              {
                moduleId: 'fljhzy',
                key: 'userChatInput'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'xj0c9p',
        name: '聊天记录',
        flowType: 'historyNode',
        position: {
          x: 194.99102398958047,
          y: 1801.3545999721096
        },
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 6,
            min: 0,
            max: 50,
            connected: true
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            valueType: 'chat_history',
            type: 'source',
            targets: [
              {
                moduleId: 'nlfwkc',
                key: 'history'
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
          x: 672.9092284362648,
          y: 1077.557793775116
        },
        inputs: [
          {
            key: 'systemPrompt',
            type: 'textarea',
            valueType: 'string',
            label: '系统提示词',
            description:
              '你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。',
            placeholder: '例如: \n1. Laf 是一个云函数开发平台……\n2. Sealos 是一个集群操作系统',
            value:
              'laf 是云开发平台，可以快速的开发应用\nlaf 是一个开源的 BaaS 开发平台（Backend as a Service)\nlaf 是一个开箱即用的 serverless 开发平台\nlaf 是一个集「函数计算」、「数据库」、「对象存储」等于一身的一站式开发平台\nlaf 可以是开源版的腾讯云开发、开源版的 Google Firebase、开源版的 UniCloud',
            connected: true
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            valueType: 'chat_history',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            required: true,
            valueType: 'string',
            connected: true
          },
          {
            key: 'agents',
            type: 'custom',
            label: '',
            value: [
              {
                value: '打招呼、问候等问题',
                key: 'fasw'
              },
              {
                value: '“laf” 的问题',
                key: 'fqsw'
              },
              {
                value: '商务问题',
                key: 'fesw'
              },
              {
                value: '其他问题',
                key: 'oy1c'
              }
            ],
            connected: true
          }
        ],
        outputs: [
          {
            key: 'fasw',
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
            key: 'fqsw',
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
            key: 'fesw',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: '5v78ap',
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
          }
        ]
      },
      {
        moduleId: 'a99p6z',
        name: '指定回复',
        flowType: 'answerNode',
        position: {
          x: 1304.2886011902247,
          y: 776.1589509539264
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: true
          },
          {
            key: 'text',
            value: '你好，我是 laf 助手，有什么可以帮助你的？',
            type: 'textarea',
            valueType: 'string',
            label: '回复的内容',
            description:
              '可以使用 \\n 来实现换行。也可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容',
            connected: true
          }
        ],
        outputs: []
      },
      {
        moduleId: 'iejcou',
        name: '指定回复',
        flowType: 'answerNode',
        position: {
          x: 1294.2531189034548,
          y: 2127.1297123368286
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: true
          },
          {
            key: 'text',
            value: '你好，我仅能回答 laf 相关问题，请问你有什么问题么？',
            type: 'textarea',
            valueType: 'string',
            label: '回复的内容',
            description:
              '可以使用 \\n 来实现换行。也可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容',
            connected: true
          }
        ],
        outputs: []
      },
      {
        moduleId: 'nlfwkc',
        name: 'AI 对话',
        flowType: 'chatNode',
        showStatus: true,
        position: {
          x: 1821.979893659983,
          y: 1104.6583548423682
        },
        inputs: [
          {
            key: 'model',
            type: 'custom',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [],
            connected: true
          },
          {
            key: 'temperature',
            type: 'slider',
            label: '温度',
            value: 0,
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
            connected: true
          },
          {
            key: 'maxToken',
            type: 'custom',
            label: '回复上限',
            value: 8000,
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
            connected: true
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            valueType: 'string',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}',
            value: '知识库是关于 laf 的内容。',
            connected: true
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: true
          },
          {
            key: 'quoteQA',
            type: 'target',
            label: '引用内容',
            valueType: 'kb_quote',
            connected: true
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            valueType: 'chat_history',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            required: true,
            valueType: 'string',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'answerText',
            label: '模型回复',
            description: '直接响应，无需配置',
            type: 'hidden',
            targets: []
          },
          {
            key: 'finish',
            label: '回复结束',
            description: 'AI 回复完成后触发',
            valueType: 'boolean',
            type: 'source',
            targets: []
          }
        ]
      },
      {
        moduleId: 's4v9su',
        name: '聊天记录',
        flowType: 'historyNode',
        position: {
          x: 193.3803955457983,
          y: 1116.251200765746
        },
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 2,
            min: 0,
            max: 50,
            connected: true
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: true
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            valueType: 'chat_history',
            type: 'source',
            targets: [
              {
                moduleId: 'remuj3',
                key: 'history'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'fljhzy',
        name: '知识库搜索',
        flowType: 'kbSearchNode',
        showStatus: true,
        position: {
          x: 1305.5374262228029,
          y: 1120.0404921820218
        },
        inputs: [
          {
            type: 'custom',
            label: '关联的知识库',
            list: [],
            key: 'kbList',
            value: [],
            connected: true
          },
          {
            key: 'similarity',
            type: 'slider',
            label: '相似度',
            value: 0.76,
            min: 0,
            max: 1,
            step: 0.01,
            markList: [
              {
                label: '100',
                value: 100
              },
              {
                label: '1',
                value: 1
              }
            ],
            connected: true
          },
          {
            key: 'limit',
            type: 'slider',
            label: '单次搜索上限',
            description: '最多取 n 条记录作为本次问题引用',
            value: 5,
            min: 1,
            max: 20,
            step: 1,
            markList: [
              {
                label: '1',
                value: 1
              },
              {
                label: '20',
                value: 20
              }
            ],
            connected: true
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            required: true,
            valueType: 'string',
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
            valueType: 'kb_quote',
            targets: [
              {
                moduleId: 'nlfwkc',
                key: 'quoteQA'
              }
            ]
          }
        ]
      },
      {
        moduleId: 'q9equb',
        name: '用户引导',
        flowType: 'userGuide',
        position: {
          x: 191.4857498376603,
          y: 856.6847387508401
        },
        inputs: [
          {
            key: 'welcomeText',
            type: 'input',
            label: '开场白',
            value:
              '你好，我是 laf 助手，有什么可以帮助你的？\n[laf 是什么？有什么用？]\n[laf 在线体验地址]\n[官网地址是多少]',
            connected: true
          }
        ],
        outputs: []
      },
      {
        moduleId: 'tc90wz',
        name: '指定回复',
        flowType: 'answerNode',
        position: {
          x: 1828.4596416688908,
          y: 765.3628156185887
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: true
          },
          {
            key: 'text',
            value: '对不起，我找不到你的问题，请更加详细的描述你的问题。',
            type: 'textarea',
            valueType: 'string',
            label: '回复的内容',
            description:
              '可以使用 \\n 来实现换行。也可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容',
            connected: true
          }
        ],
        outputs: []
      },
      {
        moduleId: '5v78ap',
        name: '指定回复',
        flowType: 'answerNode',
        position: {
          x: 1294.814522053934,
          y: 1822.7626988141562
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            valueType: 'any',
            connected: true
          },
          {
            key: 'text',
            value: '这是一个商务问题',
            type: 'textarea',
            valueType: 'string',
            label: '回复的内容',
            description:
              '可以使用 \\n 来实现换行。也可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容',
            connected: true
          }
        ],
        outputs: []
      }
    ]
  }
];
