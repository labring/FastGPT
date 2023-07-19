import { AppModuleItemTypeEnum, SystemInputEnum, SpecificInputEnum } from '../app';
import { FlowModuleTypeEnum, FlowInputItemTypeEnum, FlowOutputItemTypeEnum } from './index';
import type { AppItemType, AppModuleTemplateItemType } from '@/types/app';
import { chatModelList } from '@/store/static';
import {
  Input_Template_History,
  Input_Template_TFSwitch,
  Input_Template_UserChatInput
} from './inputTemplate';
import { rawSearchKey } from '../chat';

export const VariableModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/variable.png',
  name: '全局变量',
  intro: '可以在对话开始前，要求用户填写一些内容作为本轮对话的变量。该模块位于开场引导之后。',
  description:
    '全局变量可以通过 {{变量key}} 的形式注入到其他模块的文本中。目前支持：提示词、限定词。',
  type: AppModuleItemTypeEnum.variable,
  flowType: FlowModuleTypeEnum.variable,
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
export const UserGuideModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/userGuide.png',
  name: '用户引导',
  intro: '可以添加特殊的对话前后引导模块，更好的让用户进行对话',
  type: AppModuleItemTypeEnum.userGuide,
  flowType: FlowModuleTypeEnum.userGuide,
  inputs: [
    {
      key: SystemInputEnum.welcomeText,
      type: FlowInputItemTypeEnum.input,
      label: '开场白'
    }
  ],
  outputs: []
};
export const UserInputModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/userChatInput.png',
  name: '用户问题',
  intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
  type: AppModuleItemTypeEnum.initInput,
  flowType: FlowModuleTypeEnum.questionInputNode,
  url: '/app/modules/init/userChatInput',
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
      targets: []
    }
  ]
};
export const HistoryModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/history.png',
  name: '聊天记录',
  intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
  type: AppModuleItemTypeEnum.initInput,
  flowType: FlowModuleTypeEnum.historyNode,
  url: '/app/modules/init/history',
  inputs: [
    {
      key: 'maxContext',
      type: FlowInputItemTypeEnum.numberInput,
      label: '最长记录数',
      value: 4,
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
      type: FlowOutputItemTypeEnum.source,
      targets: []
    }
  ]
};

const defaultModel = chatModelList[0];
export const ChatModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/AI.png',
  name: 'AI 对话',
  intro: 'AI 大模型对话',
  flowType: FlowModuleTypeEnum.chatNode,
  type: AppModuleItemTypeEnum.http,
  url: '/app/modules/chat/gpt',
  inputs: [
    {
      key: 'model',
      type: FlowInputItemTypeEnum.custom,
      label: '对话模型',
      value: defaultModel?.model,
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
      value: defaultModel ? defaultModel.contextMaxToken / 2 : 2000,
      min: 100,
      max: defaultModel?.contextMaxToken || 4000,
      step: 50,
      markList: [
        { label: '100', value: 100 },
        {
          label: `${defaultModel?.contextMaxToken || 4000}`,
          value: defaultModel?.contextMaxToken || 4000
        }
      ]
    },
    {
      key: 'systemPrompt',
      type: FlowInputItemTypeEnum.textarea,
      label: '系统提示词',
      description:
        '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
      placeholder:
        '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
      value: ''
    },
    {
      key: 'limitPrompt',
      type: FlowInputItemTypeEnum.textarea,
      label: '限定词',
      description:
        '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
      placeholder:
        '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
      value: ''
    },
    // Input_Template_TFSwitch,
    {
      key: 'quotePrompt',
      type: FlowInputItemTypeEnum.target,
      label: '引用内容'
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      key: SpecificInputEnum.answerText,
      label: '模型回复',
      description: '直接响应，无需配置',
      type: FlowOutputItemTypeEnum.hidden,
      targets: []
    }
  ]
};

export const KBSearchModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/db.png',
  name: '知识库搜索',
  intro: '去知识库中搜索对应的答案。可作为 AI 对话引用参考。',
  flowType: FlowModuleTypeEnum.kbSearchNode,
  type: AppModuleItemTypeEnum.http,
  url: '/app/modules/kb/search',
  inputs: [
    {
      key: 'kb_ids',
      type: FlowInputItemTypeEnum.custom,
      label: '关联的知识库',
      value: [],
      list: []
    },
    {
      key: 'similarity',
      type: FlowInputItemTypeEnum.slider,
      label: '相似度',
      value: 0.8,
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
      key: rawSearchKey,
      label: '源搜索数据',
      type: FlowOutputItemTypeEnum.hidden,
      response: true,
      targets: []
    },
    {
      key: 'isEmpty',
      label: '搜索结果为空',
      type: FlowOutputItemTypeEnum.source,
      targets: []
    },
    {
      key: 'quotePrompt',
      label: '引用内容',
      description: '搜索结果为空时不返回',
      type: FlowOutputItemTypeEnum.source,
      targets: []
    }
  ]
};

export const AnswerModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/reply.png',
  name: '指定回复',
  intro: '该模块可以直接回复一段指定的内容。常用于引导、提示。',
  type: AppModuleItemTypeEnum.answer,
  flowType: FlowModuleTypeEnum.answerNode,
  inputs: [
    Input_Template_TFSwitch,
    {
      key: SpecificInputEnum.answerText,
      value: '',
      type: FlowInputItemTypeEnum.textarea,
      label: '回复的内容'
    }
  ],
  outputs: []
};
export const TFSwitchModule: AppModuleTemplateItemType = {
  logo: '',
  name: 'TF开关',
  intro: '可以判断输入的内容为 True 或者 False，从而执行不同操作。',
  type: AppModuleItemTypeEnum.switch,
  flowType: FlowModuleTypeEnum.tfSwitchNode,
  inputs: [
    {
      key: SystemInputEnum.switch,
      type: FlowInputItemTypeEnum.target,
      label: '输入'
    }
  ],
  outputs: [
    {
      key: 'true',
      label: 'True',
      type: FlowOutputItemTypeEnum.source,
      targets: []
    },
    {
      key: 'false',
      label: 'False',
      type: FlowOutputItemTypeEnum.source,
      targets: []
    }
  ]
};
export const ClassifyQuestionModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/cq.png',
  name: '问题分类',
  intro: '可以判断用户问题属于哪方面问题，从而执行不同的操作。',
  description:
    '根据用户的历史记录和当前问题判断该次提问的类型。可以添加多组问题类型，下面是一个模板例子：\n类型1: 打招呼\n类型2: 关于 laf 通用问题\n类型3: 关于 laf 代码问题\n类型4: 其他问题',
  type: AppModuleItemTypeEnum.http,
  url: '/app/modules/agent/classifyQuestion',
  flowType: FlowModuleTypeEnum.classifyQuestion,
  inputs: [
    {
      key: 'systemPrompt',
      type: FlowInputItemTypeEnum.textarea,
      label: '系统提示词',
      description:
        '你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。',
      placeholder: '例如: \n1. Laf 是一个云函数开发平台……\n2. Sealos 是一个集群操作系统',
      value: ''
    },
    Input_Template_History,
    Input_Template_UserChatInput,
    {
      key: 'agents',
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

export const ModuleTemplates = [
  {
    label: '输入模块',
    list: [UserInputModule, HistoryModule, VariableModule, UserGuideModule]
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
    list: [ClassifyQuestionModule]
  }
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
        ...UserInputModule,
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            label: '用户问题',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: '用户问题',
            type: 'source',
            targets: [
              {
                moduleId: '7pacf0',
                key: 'userChatInput'
              }
            ]
          }
        ],
        position: {
          x: 477.9074315528994,
          y: 1604.2106242223683
        },
        moduleId: '7z5g5h'
      },
      {
        ...ChatModule,
        inputs: [
          {
            key: 'model',
            type: 'custom',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [
              {
                label: 'FastAI-4k',
                value: 'gpt-3.5-turbo'
              },
              {
                label: 'FastAI-16k',
                value: 'gpt-3.5-turbo-16k'
              },
              {
                label: 'FastAI-Plus',
                value: 'gpt-4'
              }
            ],
            connected: false
          },
          {
            key: 'temperature',
            type: 'custom',
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
            connected: false
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
                label: '0',
                value: 0
              },
              {
                label: '16000',
                value: 16000
              }
            ],
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
            value: '',
            connected: false
          },
          {
            key: 'limitPrompt',
            type: 'textarea',
            label: '限定词',
            description:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            placeholder:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            value: '',
            connected: false
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: false
          },
          {
            key: 'quotePrompt',
            type: 'target',
            label: '引用内容',
            connected: false
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
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
          }
        ],
        position: {
          x: 981.9682828103937,
          y: 890.014595014464
        },
        moduleId: '7pacf0'
      },
      {
        ...HistoryModule,
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 4,
            min: 0,
            max: 50,
            connected: false
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            type: 'source',
            targets: [
              {
                moduleId: '7pacf0',
                key: 'history'
              }
            ]
          }
        ],
        position: {
          x: 452.5466249541586,
          y: 1276.3930310334215
        },
        moduleId: 'xj0c9p'
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
        ...UserInputModule,
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            label: '用户问题',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: '用户问题',
            type: 'source',
            targets: [
              {
                moduleId: 'q9v14m',
                key: 'userChatInput'
              },
              {
                moduleId: 'qbf8td',
                key: 'userChatInput'
              }
            ]
          }
        ],
        position: {
          x: -196.84632684738483,
          y: 797.3401378431948
        },
        moduleId: 'v0nc1s'
      },
      {
        ...HistoryModule,
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 4,
            min: 0,
            max: 50,
            connected: false
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            type: 'source',
            targets: [
              {
                moduleId: 'qbf8td',
                key: 'history'
              }
            ]
          }
        ],
        position: {
          x: 211.58250540918442,
          y: 611.8700401034965
        },
        moduleId: 'k9y3jm'
      },
      {
        ...ChatModule,
        inputs: [
          {
            key: 'model',
            type: 'custom',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [
              {
                label: 'FastAI-4k',
                value: 'gpt-3.5-turbo'
              },
              {
                label: 'FastAI-16k',
                value: 'gpt-3.5-turbo-16k'
              },
              {
                label: 'FastAI-Plus',
                value: 'gpt-4'
              }
            ],
            connected: false
          },
          {
            key: 'temperature',
            type: 'custom',
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
            connected: false
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
                label: '0',
                value: 0
              },
              {
                label: '16000',
                value: 16000
              }
            ],
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
            value: '',
            connected: false
          },
          {
            key: 'limitPrompt',
            type: 'textarea',
            label: '限定词',
            description:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            placeholder:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            value: '知识库是关于 Laf 的内容，参考知识库回答我的问题。',
            connected: false
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'quotePrompt',
            type: 'target',
            label: '引用内容',
            connected: true
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
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
          }
        ],
        position: {
          x: 745.484449528062,
          y: 259.9361900288137
        },
        moduleId: 'qbf8td'
      },
      {
        ...KBSearchModule,
        inputs: [
          {
            key: 'kb_ids',
            type: 'custom',
            label: '关联的知识库',
            value: [],
            list: [],
            connected: false
          },
          {
            key: 'similarity',
            type: 'custom',
            label: '相似度',
            value: 0.8,
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
            connected: false
          },
          {
            key: 'limit',
            type: 'custom',
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
            connected: false
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            connected: true
          }
        ],
        outputs: [
          {
            key: rawSearchKey,
            label: '源搜索数据',
            type: 'hidden',
            response: true,
            targets: []
          },
          {
            key: 'isEmpty',
            label: '搜索结果为空',
            type: 'source',
            targets: [
              {
                moduleId: 'w8av9y',
                key: 'switch'
              }
            ]
          },
          {
            key: 'quotePrompt',
            label: '引用内容',
            description: '搜索结果为空时不返回',
            type: 'source',
            targets: [
              {
                moduleId: 'qbf8td',
                key: 'quotePrompt'
              }
            ]
          }
        ],
        position: {
          x: 101.2612930583856,
          y: -31.342317423453437
        },
        moduleId: 'q9v14m'
      },
      {
        ...AnswerModule,
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'answerText',
            value: '对不起，我没有找到你的问题',
            type: 'input',
            label: '回复的内容',
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: 673.6108151684664,
          y: -84.13355134221933
        },
        moduleId: 'w8av9y'
      },
      {
        ...UserGuideModule,
        inputs: [
          {
            key: 'welcomeText',
            type: 'input',
            label: '开场白',
            value:
              '你好，我是 Laf 助手，请问有什么可以帮助你的么？\n[laf 是什么？]\n[官网是多少？]',
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: -338.02984747117785,
          y: 203.21398144017178
        },
        moduleId: 'v7lq0x'
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
        ...UserInputModule,
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            label: '用户问题',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: '用户问题',
            type: 'source',
            targets: [
              {
                moduleId: '7pacf0',
                key: 'userChatInput'
              }
            ]
          }
        ],
        position: {
          x: 485.8457451202796,
          y: 1601.0352987954163
        },
        moduleId: '7z5g5h'
      },
      {
        ...ChatModule,
        inputs: [
          {
            key: 'model',
            type: 'custom',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [
              {
                label: 'FastAI-4k',
                value: 'gpt-3.5-turbo'
              },
              {
                label: 'FastAI-16k',
                value: 'gpt-3.5-turbo-16k'
              },
              {
                label: 'FastAI-Plus',
                value: 'gpt-4'
              }
            ],
            connected: false
          },
          {
            key: 'temperature',
            type: 'custom',
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
            connected: false
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
                label: '0',
                value: 0
              },
              {
                label: '16000',
                value: 16000
              }
            ],
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
            value: '',
            connected: false
          },
          {
            key: 'limitPrompt',
            type: 'textarea',
            label: '限定词',
            description:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            placeholder:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            value: '将我发送的任何内容，直接翻译成{{language}}',
            connected: false
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: false
          },
          {
            key: 'quotePrompt',
            type: 'target',
            label: '引用内容',
            connected: false
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
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
          }
        ],
        position: {
          x: 981.9682828103937,
          y: 890.014595014464
        },
        moduleId: '7pacf0'
      },
      {
        ...HistoryModule,
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 4,
            min: 0,
            max: 50,
            connected: false
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            type: 'source',
            targets: [
              {
                moduleId: '7pacf0',
                key: 'history'
              }
            ]
          }
        ],
        position: {
          x: 446.2698477029736,
          y: 1281.1006139718102
        },
        moduleId: 'xj0c9p'
      },
      {
        ...VariableModule,
        inputs: [
          {
            key: 'variables',
            type: 'systemInput',
            label: '变量输入',
            value: [
              {
                id: 'z3bs2f',
                key: 'language',
                label: '目标语言',
                type: 'select',
                required: true,
                maxLen: 50,
                enums: [
                  {
                    value: '英语'
                  },
                  {
                    value: '法语'
                  },
                  {
                    value: '日语'
                  }
                ]
              }
            ],
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: 513.9049244392417,
          y: 996.8739106932076
        },
        moduleId: '7blchb'
      },
      {
        ...UserGuideModule,
        inputs: [
          {
            key: 'welcomeText',
            type: 'input',
            label: '开场白',
            value: '你好，我是翻译助手，可以帮你翻译任何语言。请告诉我，你需要翻译成什么语言？',
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: 173.17995039750167,
          y: 982.945778706804
        },
        moduleId: 'w35iml'
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
        ...UserInputModule,
        inputs: [
          {
            key: 'userChatInput',
            type: 'systemInput',
            label: '用户问题',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'userChatInput',
            label: '用户问题',
            type: 'source',
            targets: [
              {
                moduleId: '3n49vn',
                key: 'userChatInput'
              },
              {
                moduleId: 's7qnhf',
                key: 'userChatInput'
              },
              {
                moduleId: '15c9bv',
                key: 'userChatInput'
              }
            ]
          }
        ],
        position: {
          x: -216.08819066976912,
          y: 585.9302721518841
        },
        moduleId: 'xzj0oo'
      },
      {
        ...HistoryModule,
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 4,
            min: 0,
            max: 50,
            connected: false
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            type: 'source',
            targets: [
              {
                moduleId: '3n49vn',
                key: 'history'
              }
            ]
          }
        ],
        position: {
          x: 1146.0216647621794,
          y: 236.92269104756855
        },
        moduleId: 'hh6of9'
      },
      {
        ...ChatModule,
        inputs: [
          {
            key: 'model',
            type: 'select',
            label: '对话模型',
            value: 'gpt-3.5-turbo',
            list: [
              {
                label: 'FastAI-16k',
                value: 'gpt-3.5-turbo-16k'
              },
              {
                label: 'FastAI-4k',
                value: 'gpt-3.5-turbo'
              },
              {
                label: 'FastAI-Plus-8k',
                value: 'gpt-4'
              }
            ],
            connected: false
          },
          {
            key: 'temperature',
            type: 'custom',
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
            connected: false
          },
          {
            key: 'maxToken',
            type: 'custom',
            label: '回复上限',
            value: 3000,
            min: 100,
            max: 4000,
            step: 50,
            markList: [
              {
                label: '0',
                value: 0
              },
              {
                label: '4000',
                value: 4000
              }
            ],
            connected: false
          },
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            description:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
            placeholder:
              '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。',
            value: '你是 Laf 助手，可以回答 Laf 相关问题。',
            connected: false
          },
          {
            key: 'limitPrompt',
            type: 'textarea',
            label: '限定词',
            description:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            placeholder:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            value: '知识库是 Laf 的内容，参考知识库回答问题。',
            connected: false
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: false
          },
          {
            key: 'quotePrompt',
            type: 'target',
            label: '引用内容',
            connected: true
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
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
          }
        ],
        position: {
          x: 1494.4843114348841,
          y: -13.57201521210618
        },
        moduleId: '3n49vn'
      },
      {
        ...KBSearchModule,
        inputs: [
          {
            key: 'kb_ids',
            type: 'custom',
            label: '关联的知识库',
            value: [],
            list: [],
            connected: false
          },
          {
            key: 'similarity',
            type: 'custom',
            label: '相似度',
            value: 0.8,
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
            connected: false
          },
          {
            key: 'limit',
            type: 'custom',
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
            connected: false
          },
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            connected: true
          }
        ],
        outputs: [
          {
            key: rawSearchKey,
            label: '源搜索数据',
            type: 'hidden',
            response: true,
            targets: []
          },
          {
            key: 'isEmpty',
            label: '搜索结果为空',
            type: 'source',
            targets: [
              {
                moduleId: 'phwr0u',
                key: 'switch'
              }
            ]
          },
          {
            key: 'quotePrompt',
            label: '引用内容',
            description: '搜索结果为空时不返回',
            type: 'source',
            targets: [
              {
                moduleId: '3n49vn',
                key: 'quotePrompt'
              }
            ]
          }
        ],
        position: {
          x: 690.1930900957847,
          y: 102.10119978743109
        },
        moduleId: 's7qnhf'
      },
      {
        ...HistoryModule,
        inputs: [
          {
            key: 'maxContext',
            type: 'numberInput',
            label: '最长记录数',
            value: 2,
            min: 0,
            max: 50,
            connected: false
          },
          {
            key: 'history',
            type: 'hidden',
            label: '聊天记录',
            connected: false
          }
        ],
        outputs: [
          {
            key: 'history',
            label: '聊天记录',
            type: 'source',
            targets: [
              {
                moduleId: '15c9bv',
                key: 'history'
              }
            ]
          }
        ],
        position: {
          x: -274.2362185453961,
          y: 152.19755525696058
        },
        moduleId: 'qiwrjt'
      },
      {
        ...AnswerModule,
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'answerText',
            value: '你好，我是 Laf 助手，有什么可以帮助你的么？',
            type: 'input',
            label: '回复的内容',
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: 686.1260929408212,
          y: -142.16731465682332
        },
        moduleId: 'l4e36k'
      },
      {
        ...AnswerModule,
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'answerText',
            value: '对不起，我无法回答你的问题，请问有什么关于 Laf 的问题么？',
            type: 'input',
            label: '回复的内容',
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: 1469.3636235179692,
          y: 937.5555811306511
        },
        moduleId: 'phwr0u'
      },
      {
        ...ClassifyQuestionModule,
        inputs: [
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            description:
              '你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。',
            placeholder: '例如: \n1. Laf 是一个云函数开发平台……\n2. Sealos 是一个集群操作系统',
            value:
              ' laf 是什么\nlaf 是云开发平台，可以快速的开发应用\nlaf 是一个开源的 BaaS 开发平台（Backend as a Service)\nlaf 是一个开箱即用的 serverless 开发平台\nlaf 是一个集「函数计算」、「数据库」、「对象存储」等于一身的一站式开发平台\nlaf 可以是开源版的腾讯云开发、开源版的 Google Firebase、开源版的 UniCloud\nlaf 让每个开发团队都可以随时拥有一个自己的云开发平台！',
            connected: false
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            connected: true
          },
          {
            key: 'userChatInput',
            type: 'target',
            label: '用户问题',
            connected: true
          },
          {
            key: 'agents',
            type: 'custom',
            label: '',
            value: [
              {
                value: '打招呼、问候等',
                key: 'fasw'
              },
              {
                value: '关于 laf 云函数的问题',
                key: 'fqsw'
              },
              {
                value: '其他问题',
                key: 'q73b'
              }
            ],
            connected: false
          }
        ],
        outputs: [
          {
            key: 'fasw',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: 'l4e36k',
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
                moduleId: 's7qnhf',
                key: 'switch'
              }
            ]
          },
          {
            key: 'q73b',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: 'phwr0u',
                key: 'switch'
              }
            ]
          }
        ],
        position: {
          x: 154.9724540917009,
          y: -37.48714632270105
        },
        moduleId: '15c9bv'
      }
    ]
  }
];
