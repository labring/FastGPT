import type { AppModuleItemType, VariableItemType } from '@/types/app';
import { chatModelList, vectorModelList } from '@/store/static';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { FlowInputItemType } from '@/types/flow';
import { SystemInputEnum } from '@/constants/app';
import type { SelectedKbType } from '@/types/plugin';
import {
  VariableModule,
  UserGuideModule,
  ChatModule,
  HistoryModule,
  UserInputModule,
  KBSearchModule,
  AnswerModule
} from '@/constants/flow/ModuleTemplate';
import { rawSearchKey } from '@/constants/chat';

export type EditFormType = {
  chatModel: {
    model: string;
    systemPrompt: string;
    limitPrompt: string;
    temperature: number;
    maxToken: number;
    frequency: number;
    presence: number;
  };
  kb: {
    list: SelectedKbType;
    searchSimilarity: number;
    searchLimit: number;
    searchEmptyText: string;
  };
  guide: {
    welcome: {
      text: string;
    };
  };
  variables: VariableItemType[];
};
export const getDefaultAppForm = (): EditFormType => {
  const defaultChatModel = chatModelList[0];
  const defaultVectorModel = vectorModelList[0];
  return {
    chatModel: {
      model: defaultChatModel.model,
      systemPrompt: '',
      limitPrompt: '',
      temperature: 0,
      maxToken: defaultChatModel.contextMaxToken / 2,
      frequency: 0.5,
      presence: -0.5
    },
    kb: {
      list: [],
      searchSimilarity: 0.8,
      searchLimit: 5,
      searchEmptyText: ''
    },
    guide: {
      welcome: {
        text: ''
      }
    },
    variables: []
  };
};

export const appModules2Form = (modules: AppModuleItemType[]) => {
  const defaultAppForm = getDefaultAppForm();
  const updateVal = ({
    formKey,
    inputs,
    key
  }: {
    formKey: string;
    inputs: FlowInputItemType[];
    key: string;
  }) => {
    const propertyPath = formKey.split('.');
    let currentObj: any = defaultAppForm;
    for (let i = 0; i < propertyPath.length - 1; i++) {
      currentObj = currentObj[propertyPath[i]];
    }

    const val =
      inputs.find((item) => item.key === key)?.value ||
      currentObj[propertyPath[propertyPath.length - 1]];

    currentObj[propertyPath[propertyPath.length - 1]] = val;
  };

  modules.forEach((module) => {
    if (module.flowType === FlowModuleTypeEnum.chatNode) {
      updateVal({
        formKey: 'chatModel.model',
        inputs: module.inputs,
        key: 'model'
      });
      updateVal({
        formKey: 'chatModel.temperature',
        inputs: module.inputs,
        key: 'temperature'
      });
      updateVal({
        formKey: 'chatModel.maxToken',
        inputs: module.inputs,
        key: 'maxToken'
      });
      updateVal({
        formKey: 'chatModel.systemPrompt',
        inputs: module.inputs,
        key: 'systemPrompt'
      });
      updateVal({
        formKey: 'chatModel.limitPrompt',
        inputs: module.inputs,
        key: 'limitPrompt'
      });
    } else if (module.flowType === FlowModuleTypeEnum.kbSearchNode) {
      updateVal({
        formKey: 'kb.list',
        inputs: module.inputs,
        key: 'kbList'
      });
      updateVal({
        formKey: 'kb.searchSimilarity',
        inputs: module.inputs,
        key: 'similarity'
      });
      updateVal({
        formKey: 'kb.searchLimit',
        inputs: module.inputs,
        key: 'limit'
      });
      // empty text
      const emptyOutputs = module.outputs.find((item) => item.key === 'isEmpty')?.targets || [];
      const emptyOutput = emptyOutputs[0];
      if (emptyOutput) {
        const target = modules.find((item) => item.moduleId === emptyOutput.moduleId);
        defaultAppForm.kb.searchEmptyText =
          target?.inputs?.find((item) => item.key === 'answerText')?.value || '';
      }
    } else if (module.flowType === FlowModuleTypeEnum.userGuide) {
      const val =
        module.inputs.find((item) => item.key === SystemInputEnum.welcomeText)?.value || '';
      if (val) {
        defaultAppForm.guide.welcome = {
          text: val
        };
      }
    } else if (module.flowType === FlowModuleTypeEnum.variable) {
      defaultAppForm.variables =
        module.inputs.find((item) => item.key === SystemInputEnum.variables)?.value || [];
    }
  });

  return defaultAppForm;
};

const chatModelInput = (formData: EditFormType) => [
  {
    key: 'model',
    type: 'custom',
    label: '对话模型',
    value: formData.chatModel.model,
    list: chatModelList.map((item) => ({
      label: item.name,
      value: item.model
    })),
    connected: false
  },
  {
    key: 'temperature',
    type: 'custom',
    label: '温度',
    value: formData.chatModel.temperature,
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
    value: formData.chatModel.maxToken,
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
    value: formData.chatModel.systemPrompt,
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
    value: formData.chatModel.limitPrompt,
    connected: false
  },
  {
    key: 'quotePrompt',
    type: 'target',
    label: '引用内容',
    connected: formData.kb.list.length > 0
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
];
const welcomeTemplate = (formData: EditFormType) =>
  formData.guide?.welcome?.text
    ? [
        {
          ...UserGuideModule,
          inputs: [
            {
              key: 'welcomeText',
              type: 'input',
              label: '开场白',
              value: formData.guide.welcome.text,
              connected: false
            }
          ],
          outputs: [],
          position: {
            x: 447.98520778293346,
            y: 721.4016845336229
          },
          moduleId: 'v7lq0x'
        }
      ]
    : [];
const variableTemplate = (formData: EditFormType) =>
  formData.variables.length > 0
    ? [
        {
          ...VariableModule,
          inputs: [
            {
              key: 'variables',
              type: 'systemInput',
              label: '变量输入',
              value: formData.variables,
              connected: false
            }
          ],
          outputs: [],
          position: {
            x: 444.0369195277651,
            y: 1008.5185781784537
          },
          moduleId: '7blchb'
        }
      ]
    : [];
const simpleChatTemplate = (formData: EditFormType) => [
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
            moduleId: 'chatModule',
            key: 'userChatInput'
          }
        ]
      }
    ],
    position: {
      x: 464.32198615344566,
      y: 1602.2698463081606
    },
    moduleId: '7z5g5h'
  },
  {
    ...HistoryModule,
    inputs: [
      {
        key: 'maxContext',
        type: 'numberInput',
        label: '最长记录数',
        value: 10,
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
            moduleId: 'chatModule',
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
  },
  {
    ...ChatModule,
    inputs: chatModelInput(formData),
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
    moduleId: 'chatModule'
  }
];
const kbTemplate = (formData: EditFormType) => [
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
            moduleId: 'chatModule',
            key: 'userChatInput'
          },
          {
            moduleId: 'q9v14m',
            key: 'userChatInput'
          }
        ]
      }
    ],
    position: {
      x: 464.32198615344566,
      y: 1602.2698463081606
    },
    moduleId: '7z5g5h'
  },
  {
    ...HistoryModule,
    inputs: [
      {
        key: 'maxContext',
        type: 'numberInput',
        label: '最长记录数',
        value: 10,
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
            moduleId: 'chatModule',
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
  },
  {
    ...KBSearchModule,
    inputs: [
      {
        key: 'kbList',
        type: 'custom',
        label: '关联的知识库',
        value: formData.kb.list,
        list: [],
        connected: true
      },
      {
        key: 'similarity',
        type: 'custom',
        label: '相似度',
        value: formData.kb.searchSimilarity,
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
        value: formData.kb.searchLimit,
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
        connected: false
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
        key: 'isEmpty',
        label: '搜索结果为空',
        type: 'source',
        targets: [
          {
            moduleId: 'emptyText',
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
            moduleId: 'chatModule',
            key: 'quotePrompt'
          }
        ]
      }
    ],
    position: {
      x: 956.0838440206068,
      y: 887.462827870246
    },
    moduleId: 'q9v14m'
  },
  ...(formData.kb.searchEmptyText
    ? [
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
              value: formData.kb.searchEmptyText,
              type: 'input',
              label: '回复的内容',
              connected: false
            }
          ],
          outputs: [],
          position: {
            x: 1570.7651822907549,
            y: 637.8753731306779
          },
          moduleId: 'emptyText'
        }
      ]
    : []),
  {
    ...ChatModule,
    inputs: chatModelInput(formData),
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
      x: 1551.71405495818,
      y: 977.4911578918461
    },
    moduleId: 'chatModule'
  }
];

export const appForm2Modules = (formData: EditFormType) => {
  const modules = [
    ...welcomeTemplate(formData),
    ...variableTemplate(formData),
    ...(formData.kb.list.length > 0 ? kbTemplate(formData) : simpleChatTemplate(formData))
  ];

  return modules as AppModuleItemType[];
};
