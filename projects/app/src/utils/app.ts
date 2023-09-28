import type { AppModuleItemType, VariableItemType } from '@/types/app';
import { chatModelList } from '@/store/static';
import {
  FlowInputItemTypeEnum,
  FlowModuleTypeEnum,
  FlowValueTypeEnum,
  SpecialInputKeyEnum
} from '@/constants/flow';
import { SystemInputEnum } from '@/constants/app';
import type { SelectedDatasetType } from '@/types/core/dataset';
import type { FlowInputItemType } from '@/types/core/app/flow';
import type { AIChatProps } from '@/types/core/aiChat';
import { getGuideModule, splitGuideModule } from '@/components/ChatBox/utils';

export type EditFormType = {
  chatModel: AIChatProps;
  kb: {
    list: SelectedDatasetType;
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
  questionGuide: boolean;
};
export const getDefaultAppForm = (): EditFormType => {
  const defaultChatModel = chatModelList[0];

  return {
    chatModel: {
      model: defaultChatModel?.model,
      systemPrompt: '',
      temperature: 0,
      quotePrompt: '',
      quoteTemplate: '',
      maxToken: defaultChatModel ? defaultChatModel.contextMaxToken / 2 : 4000,
      frequency: 0.5,
      presence: -0.5
    },
    kb: {
      list: [],
      searchSimilarity: 0.4,
      searchLimit: 5,
      searchEmptyText: ''
    },
    guide: {
      welcome: {
        text: ''
      }
    },
    variables: [],
    questionGuide: false
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
        formKey: 'chatModel.quoteTemplate',
        inputs: module.inputs,
        key: 'quoteTemplate'
      });
      updateVal({
        formKey: 'chatModel.quotePrompt',
        inputs: module.inputs,
        key: 'quotePrompt'
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
          target?.inputs?.find((item) => item.key === SpecialInputKeyEnum.answerText)?.value || '';
      }
    } else if (module.flowType === FlowModuleTypeEnum.userGuide) {
      const { welcomeText, variableModules, questionGuide } = splitGuideModule(
        getGuideModule(modules)
      );
      if (welcomeText) {
        defaultAppForm.guide.welcome = {
          text: welcomeText
        };
      }

      defaultAppForm.variables = variableModules;
      defaultAppForm.questionGuide = !!questionGuide;
    }
  });

  return defaultAppForm;
};

const chatModelInput = (formData: EditFormType): FlowInputItemType[] => [
  {
    key: 'model',
    value: formData.chatModel.model,
    type: 'custom',
    label: '对话模型',
    connected: true
  },
  {
    key: 'temperature',
    value: formData.chatModel.temperature,
    type: 'slider',
    label: '温度',
    connected: true
  },
  {
    key: 'maxToken',
    value: formData.chatModel.maxToken,
    type: 'custom',
    label: '回复上限',
    connected: true
  },
  {
    key: 'systemPrompt',
    value: formData.chatModel.systemPrompt || '',
    type: 'textarea',
    label: '系统提示词',
    connected: true
  },
  {
    key: 'quoteTemplate',
    value: formData.chatModel.quoteTemplate || '',
    type: 'hidden',
    label: '引用内容模板',
    connected: true
  },
  {
    key: 'quotePrompt',
    value: formData.chatModel.quotePrompt || '',
    type: 'hidden',
    label: '引用内容提示词',
    connected: true
  },
  {
    key: 'switch',
    type: 'target',
    label: '触发器',
    connected: formData.kb.list.length > 0
  },
  {
    key: 'quoteQA',
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
const userGuideTemplate = (formData: EditFormType): AppModuleItemType[] => [
  {
    name: '用户引导',
    flowType: FlowModuleTypeEnum.userGuide,
    inputs: [
      {
        key: SystemInputEnum.welcomeText,
        type: FlowInputItemTypeEnum.hidden,
        label: '开场白',
        value: formData.guide.welcome.text
      },
      {
        key: SystemInputEnum.variables,
        type: FlowInputItemTypeEnum.hidden,
        label: '对话框变量',
        value: formData.variables
      },
      {
        key: SystemInputEnum.questionGuide,
        type: FlowInputItemTypeEnum.hidden,
        label: '问题引导',
        value: formData.questionGuide
      }
    ],
    outputs: [],
    position: {
      x: 447.98520778293346,
      y: 721.4016845336229
    },
    moduleId: 'userGuide'
  }
];
const simpleChatTemplate = (formData: EditFormType): AppModuleItemType[] => [
  {
    name: '用户问题(对话入口)',
    flowType: FlowModuleTypeEnum.questionInput,
    inputs: [
      {
        key: 'userChatInput',
        connected: true,
        label: '用户问题',
        type: 'target'
      }
    ],
    outputs: [
      {
        key: 'userChatInput',
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
    moduleId: 'userChatInput'
  },
  {
    name: '聊天记录',
    flowType: FlowModuleTypeEnum.historyNode,
    inputs: [
      {
        key: 'maxContext',
        value: 6,
        connected: true,
        type: 'numberInput',
        label: '最长记录数'
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
    moduleId: 'history'
  },
  {
    name: 'AI 对话',
    flowType: FlowModuleTypeEnum.chatNode,
    inputs: chatModelInput(formData),
    showStatus: true,
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
    ],
    position: {
      x: 981.9682828103937,
      y: 890.014595014464
    },
    moduleId: 'chatModule'
  }
];
const kbTemplate = (formData: EditFormType): AppModuleItemType[] => [
  {
    name: '用户问题(对话入口)',
    flowType: FlowModuleTypeEnum.questionInput,
    inputs: [
      {
        key: 'userChatInput',
        label: '用户问题',
        type: 'target',
        connected: true
      }
    ],
    outputs: [
      {
        key: 'userChatInput',
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
    ],
    position: {
      x: 464.32198615344566,
      y: 1602.2698463081606
    },
    moduleId: 'userChatInput'
  },
  {
    name: '聊天记录',
    flowType: FlowModuleTypeEnum.historyNode,
    inputs: [
      {
        key: 'maxContext',
        value: 6,
        connected: true,
        type: 'numberInput',
        label: '最长记录数'
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
    moduleId: 'history'
  },
  {
    name: '知识库搜索',
    flowType: FlowModuleTypeEnum.kbSearchNode,
    showStatus: true,
    inputs: [
      {
        key: 'kbList',
        value: formData.kb.list,
        type: FlowInputItemTypeEnum.custom,
        label: '关联的知识库',
        connected: true
      },
      {
        key: 'similarity',
        value: formData.kb.searchSimilarity,
        type: FlowInputItemTypeEnum.slider,
        label: '相似度',
        connected: true
      },
      {
        key: 'limit',
        value: formData.kb.searchLimit,
        type: FlowInputItemTypeEnum.slider,
        label: '单次搜索上限',
        connected: true
      },
      {
        key: 'switch',
        type: FlowInputItemTypeEnum.target,
        label: '触发器',
        connected: false
      },
      {
        key: 'userChatInput',
        type: FlowInputItemTypeEnum.target,
        label: '用户问题',
        connected: true
      }
    ],
    outputs: [
      {
        key: 'isEmpty',
        targets: formData.kb.searchEmptyText
          ? [
              {
                moduleId: 'emptyText',
                key: 'switch'
              }
            ]
          : [
              {
                moduleId: 'chatModule',
                key: 'switch'
              }
            ]
      },
      {
        key: 'unEmpty',
        targets: [
          {
            moduleId: 'chatModule',
            key: 'switch'
          }
        ]
      },
      {
        key: 'quoteQA',
        targets: [
          {
            moduleId: 'chatModule',
            key: 'quoteQA'
          }
        ]
      }
    ],
    position: {
      x: 956.0838440206068,
      y: 887.462827870246
    },
    moduleId: 'kbSearch'
  },
  ...(formData.kb.searchEmptyText
    ? [
        {
          name: '指定回复',
          flowType: FlowModuleTypeEnum.answerNode,
          inputs: [
            {
              key: 'switch',
              type: FlowInputItemTypeEnum.target,
              label: '触发器',
              connected: true
            },
            {
              key: SpecialInputKeyEnum.answerText,
              value: formData.kb.searchEmptyText,
              type: FlowInputItemTypeEnum.textarea,
              valueType: FlowValueTypeEnum.string,
              label: '回复的内容',
              connected: true
            }
          ],
          outputs: [],
          position: {
            x: 1553.5815811529146,
            y: 637.8753731306779
          },
          moduleId: 'emptyText'
        }
      ]
    : []),
  {
    name: 'AI 对话',
    flowType: FlowModuleTypeEnum.chatNode,
    inputs: chatModelInput(formData),
    showStatus: true,
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
    ...userGuideTemplate(formData),
    ...(formData.kb.list.length > 0 ? kbTemplate(formData) : simpleChatTemplate(formData))
  ];

  return modules as AppModuleItemType[];
};
