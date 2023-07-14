import { AppModuleItemTypeEnum, SystemInputEnum, SpecificInputEnum } from '../app';
import { FlowModuleTypeEnum, FlowInputItemTypeEnum, FlowOutputItemTypeEnum } from './index';
import type { AppModuleTemplateItemType } from '@/types/app';
import { chatModelList } from '@/store/static';
import {
  Input_Template_History,
  Input_Template_TFSwitch,
  Input_Template_UserChatInput
} from './inputTemplate';

export const VariableInputModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/userGuide.png',
  name: '开场引导',
  intro: '可以在每个新对话开始前，给用户发送一段开场白，或要求用户填写一些内容作为本轮对话的变量。',
  type: AppModuleItemTypeEnum.userGuide,
  flowType: FlowModuleTypeEnum.userGuide,
  inputs: [
    {
      key: SystemInputEnum.welcomeText,
      type: FlowInputItemTypeEnum.input,
      label: '开场白'
    },
    {
      key: SystemInputEnum.variables,
      type: FlowInputItemTypeEnum.systemInput,
      label: '变量输入',
      value: []
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
  url: '/openapi/modules/init/userChatInput',
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
  url: '/openapi/modules/init/history',
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
  intro: 'OpenAI GPT 大模型对话。',
  flowType: FlowModuleTypeEnum.chatNode,
  type: AppModuleItemTypeEnum.http,
  url: '/openapi/modules/chat/gpt',
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
      type: FlowInputItemTypeEnum.slider,
      label: '回复上限',
      value: defaultModel ? defaultModel.contextMaxToken / 2 : 2000,
      min: 0,
      max: defaultModel?.contextMaxToken || 4000,
      step: 50,
      markList: [
        { label: '0', value: 0 },
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
    Input_Template_TFSwitch,
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
  url: '/openapi/modules/kb/search',
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
        { label: '0', value: 0 },
        { label: '1', value: 1 }
      ]
    },
    {
      key: 'limit',
      type: FlowInputItemTypeEnum.slider,
      label: '单次搜索上限',
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
      key: 'rawSearch',
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
      type: FlowInputItemTypeEnum.input,
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
export const RecognizeIntentionModule: AppModuleTemplateItemType = {
  logo: '/imgs/module/cq.png',
  name: '意图识别',
  intro: '可以判断用户问题属于哪方面问题，从而执行不同的操作。',
  type: AppModuleItemTypeEnum.http,
  url: '/openapi/modules/agent/recognizeIntention',
  flowType: FlowModuleTypeEnum.recognizeIntention,
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
          value: '',
          key: 'a'
        },
        {
          value: '',
          key: 'b'
        }
      ]
    }
  ],
  outputs: [
    {
      key: 'a',
      label: '',
      type: FlowOutputItemTypeEnum.hidden,
      targets: []
    },
    {
      key: 'b',
      label: '',
      type: FlowOutputItemTypeEnum.hidden,
      targets: []
    }
  ]
};

export const ModuleTemplates = [
  {
    label: '输入模块',
    list: [UserInputModule, HistoryModule, VariableInputModule]
  },
  {
    label: '对话模块',
    list: [ChatModule]
  },
  {
    label: '知识库模块',
    list: [KBSearchModule]
  },
  {
    label: '工具',
    list: [AnswerModule]
  },
  {
    label: 'Agent',
    list: [RecognizeIntentionModule]
  }
];
