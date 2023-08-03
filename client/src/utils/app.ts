import type { AppModuleItemType, VariableItemType } from '@/types/app';
import { chatModelList, vectorModelList } from '@/store/static';
import { FlowModuleTypeEnum, SpecialInputKeyEnum } from '@/constants/flow';
import { SystemInputEnum } from '@/constants/app';
import { TaskResponseKeyEnum } from '@/constants/chat';
import type { SelectedKbType } from '@/types/plugin';
import { FlowInputItemType } from '@/types/flow';

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
          target?.inputs?.find((item) => item.key === SpecialInputKeyEnum.answerText)?.value || '';
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

const chatModelInput = (formData: EditFormType): FlowInputItemType[] => [
  {
    key: 'model',
    value: formData.chatModel.model,
    connected: true
  },
  {
    key: 'temperature',
    value: formData.chatModel.temperature,
    connected: true
  },
  {
    key: 'maxToken',
    value: formData.chatModel.maxToken,
    connected: true
  },
  {
    key: 'systemPrompt',
    value: formData.chatModel.systemPrompt,
    connected: true
  },
  {
    key: 'limitPrompt',
    value: formData.chatModel.limitPrompt,
    connected: true
  },
  {
    key: 'switch',
    connected: formData.kb.list.length > 0
  },
  {
    key: 'quoteQA',
    connected: formData.kb.list.length > 0
  },
  {
    key: 'history',
    connected: true
  },
  {
    key: 'userChatInput',
    connected: true
  }
];
const welcomeTemplate = (formData: EditFormType): AppModuleItemType[] =>
  formData.guide?.welcome?.text
    ? [
        {
          flowType: FlowModuleTypeEnum.userGuide,
          inputs: [
            {
              key: 'welcomeText',
              value: formData.guide.welcome.text,
              connected: true
            }
          ],
          outputs: [],
          position: {
            x: 447.98520778293346,
            y: 721.4016845336229
          },
          moduleId: 'userGuide'
        }
      ]
    : [];
const variableTemplate = (formData: EditFormType): AppModuleItemType[] =>
  formData.variables.length > 0
    ? [
        {
          flowType: FlowModuleTypeEnum.variable,
          inputs: [
            {
              key: 'variables',
              value: formData.variables,
              connected: true
            }
          ],
          outputs: [],
          position: {
            x: 444.0369195277651,
            y: 1008.5185781784537
          },
          moduleId: 'variable'
        }
      ]
    : [];
const simpleChatTemplate = (formData: EditFormType): AppModuleItemType[] => [
  {
    flowType: FlowModuleTypeEnum.questionInput,
    inputs: [
      {
        key: 'userChatInput',
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
    flowType: FlowModuleTypeEnum.historyNode,
    inputs: [
      {
        key: 'maxContext',
        value: 6,
        connected: true
      },
      {
        key: 'history',
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
    flowType: FlowModuleTypeEnum.chatNode,
    inputs: chatModelInput(formData),
    outputs: [
      {
        key: TaskResponseKeyEnum.answerText,
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
    flowType: FlowModuleTypeEnum.questionInput,
    inputs: [
      {
        key: 'userChatInput',
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
    flowType: FlowModuleTypeEnum.historyNode,
    inputs: [
      {
        key: 'maxContext',
        value: 6,
        connected: true
      },
      {
        key: 'history',
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
    flowType: FlowModuleTypeEnum.kbSearchNode,
    inputs: [
      {
        key: 'kbList',
        value: formData.kb.list,
        connected: true
      },
      {
        key: 'similarity',
        value: formData.kb.searchSimilarity,
        connected: true
      },
      {
        key: 'limit',
        value: formData.kb.searchLimit,
        connected: true
      },
      {
        key: 'switch',
        connected: false
      },
      {
        key: 'userChatInput',
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
          flowType: FlowModuleTypeEnum.answerNode,
          inputs: [
            {
              key: 'switch',
              connected: true
            },
            {
              key: SpecialInputKeyEnum.answerText,
              value: formData.kb.searchEmptyText,
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
    flowType: FlowModuleTypeEnum.chatNode,
    inputs: chatModelInput(formData),
    outputs: [
      {
        key: TaskResponseKeyEnum.answerText,
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
