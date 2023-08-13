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
import type { FlowModuleTemplateType } from '@/types/flow';
import { chatModelList } from '@/store/static';
import {
  Input_Template_History,
  Input_Template_TFSwitch,
  Input_Template_UserChatInput
} from './inputTemplate';
import { ContextExtractEnum, HttpPropsEnum } from './flowField';

export const ChatModelSystemTip =
  'Fixed model prompt that guides the direction of the conversation when adjusted. This content will be fixed at the beginning of the context. Variables can be used, for example, {{language}}.';
export const ChatModelLimitTip =
  'Limits the scope of the model conversation and is placed before the current question with strong guidance and specificity. Variables can be used, for example, {{language}}. Examples of guidance:\n1. The knowledge base is about an introduction to Laf. Refer to the knowledge base to answer questions. For content unrelated to "Laf," reply directly: "I don't know."\n2. You only answer questions about "xxx," reply "xxxx" for other questions.';
export const userGuideTip = 'Special dialogue pre- and post-guide modules can be added to facilitate better user conversation.';
export const welcomeTextTip =
  'Before each conversation begins, send an initial content. Supports standard Markdown syntax and allows the use of additional tags:\n[Shortcut Key]: After users click, they can directly send the corresponding question.';

export const VariableModule: FlowModuleTemplateType = {
  logo: '/imgs/module/variable.png',
  name: 'Global Variables',
  intro: 'Requests users to provide certain information as variables for the current conversation before it begins. This module is positioned after the introduction.',
  description:
    'Global variables can be injected into other module string inputs in the form of {{variable key}}, such as prompts and constraints.',
  flowType: FlowModuleTypeEnum.variable,
  inputs: [
    {
      key: SystemInputEnum.variables,
      type: FlowInputItemTypeEnum.systemInput,
      label: 'Variable Input',
      value: []
    }
  ],
  outputs: []
};
export const UserGuideModule: FlowModuleTemplateType = {
  logo: '/imgs/module/userGuide.png',
  name: 'User Guide',
  intro: userGuideTip,
  flowType: FlowModuleTypeEnum.userGuide,
  inputs: [
    {
      key: SystemInputEnum.welcomeText,
      type: FlowInputItemTypeEnum.input,
      label: 'Welcome Text'
    }
  ],
  outputs: []
};
export const UserInputModule: FlowModuleTemplateType = {
  logo: '/imgs/module/userChatInput.png',
  name: 'User Question (Conversation Entry)',
  intro: 'User input content. This module typically serves as the entry point of the application and is the first to execute after users send messages.',
  flowType: FlowModuleTypeEnum.questionInput,
  inputs: [
    {
      key: SystemInputEnum.userChatInput,
      type: FlowInputItemTypeEnum.systemInput,
      label: 'User Question'
    }
  ],
  outputs: [
    {
      key: SystemInputEnum.userChatInput,
      label: 'User Question',
      type: FlowOutputItemTypeEnum.source,
      valueType: FlowValueTypeEnum.string,
      targets: []
    }
  ]
};
export const HistoryModule: FlowModuleTemplateType = {
  logo: '/imgs/module/history.png',
  name: 'Chat History',
  intro: 'User input content. This module typically serves as the entry point of the application and is the first to execute after users send messages.',
  flowType: FlowModuleTypeEnum.historyNode,
  inputs: [
    {
      key: 'maxContext',
      type: FlowInputItemTypeEnum.numberInput,
      label: 'Maximum Record Count',
      value: 6,
      min: 0,
      max: 50
    },
    {
      key: SystemInputEnum.history,
      type: FlowInputItemTypeEnum.hidden,
      label: 'Chat History'
    }
  ],
  outputs: [
    {
      key: SystemInputEnum.history,
      label: 'Chat History',
      valueType: FlowValueTypeEnum.chatHistory,
      type: FlowOutputItemTypeEnum.source,
      targets: []
    }
  ]
};

export const ChatModule: FlowModuleTemplateType = {
  logo: '/imgs/module/AI.png',
  name: 'AI Conversation',
  intro: 'AI large model conversation',
  flowType: FlowModuleTypeEnum.chatNode,
  showStatus: true,
  inputs: [
    {
      key: 'model',
      type: FlowInputItemTypeEnum.custom,
      label: 'Conversation Model',
      value: chatModelList[0]?.model,
      list: chatModelList.map((item) => ({ label: item.name, value: item.model }))
    },
    {
      key: 'temperature',
      type: FlowInputItemTypeEnum.slider,
      label: 'Temperature',
      value: 0,
      min: 0,
      max: 10,
      step: 1,
      markList: [
        { label: 'Precise', value: 0 },
        { label: 'Divergent', value: 10 }
      ]
    },
    {
      key: 'maxToken',
      type: FlowInputItemTypeEnum.custom,
      label: 'Response Limit',
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
      label: 'System Prompt',
      valueType: FlowValueTypeEnum.string,
      description: ChatModelSystemTip,
      placeholder: ChatModelSystemTip,
      value: ''
    },
    {
      key: 'limitPrompt',
      type: FlowInputItemTypeEnum.textarea,
      valueType: FlowValueTypeEnum.string,
      label: 'Limit Prompt',
      description: ChatModelLimitTip,
      placeholder: ChatModelLimitTip,
      value: ''
    },
    Input_Template_TFSwitch,
    {
      key: 'quoteQA',
      type: FlowInputItemTypeEnum.target,
      label: 'Quoted Content',
      valueType: FlowValueTypeEnum.kbQuote
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      key: TaskResponseKeyEnum.answerText,
      label: 'Model Reply',
      description: 'Direct response, no configuration required',
      type: FlowOutputItemTypeEnum.hidden,
      targets: []
    },
    {
        key: 'finish',
        label: 'Response Complete',
        description: 'Triggered after AI response completion',
        valueType: FlowValueTypeEnum.boolean,
        type: FlowOutputItemTypeEnum.source,
        targets: []
    }
  ]
};

export const KBSearchModule: FlowModuleTemplateType = {
    logo: '/imgs/module/db.png',
    name: 'Knowledge Base Search',
    intro: 'Searches for corresponding answers in the knowledge base. Can be used as a reference for AI conversations.',
    flowType: FlowModuleTypeEnum.kbSearchNode,
    showStatus: true,
    inputs: [
      {
        key: 'kbList',
        type: FlowInputItemTypeEnum.custom,
        label: 'Associated Knowledge Bases',
        value: [],
        list: []
      },
      {
        key: 'similarity',
        type: FlowInputItemTypeEnum.slider,
        label: 'Similarity',
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
        label: 'Single Search Limit',
        description: 'Retrieve up to n records as references for this question',
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
        label: 'Search Results Empty',
        type: FlowOutputItemTypeEnum.source,
        valueType: FlowValueTypeEnum.boolean,
        targets: []
      },
      {
        key: 'unEmpty',
        label: 'Search Results Not Empty',
        type: FlowOutputItemTypeEnum.source,
        valueType: FlowValueTypeEnum.boolean,
        targets: []
      },
      {
        key: 'quoteQA',
        label: 'Quoted Content',
        description:
          'Always returns an array. If you want to perform additional actions when the search results are empty, you need to use the two inputs above and the triggers of the target module.',
        type: FlowOutputItemTypeEnum.source,
        valueType: FlowValueTypeEnum.kbQuote,
        targets: []
      }
    ]
  };
  

  export const AnswerModule: FlowModuleTemplateType = {
    logo: '/imgs/module/reply.png',
    name: 'Specified Reply',
    intro: 'This module can directly provide a specified content as a reply. Commonly used for guidance and prompts.',
    description: 'This module can directly provide a specified content as a reply. Commonly used for guidance and prompts.',
    flowType: FlowModuleTypeEnum.answerNode,
    inputs: [
      Input_Template_TFSwitch,
      {
        key: SpecialInputKeyEnum.answerText,
        value: '',
        type: FlowInputItemTypeEnum.textarea,
        valueType: FlowValueTypeEnum.string,
        label: 'Reply Content',
        description:
          'You can use \\n to create line breaks. Alternatively, you can provide external module inputs to generate replies. External module inputs will override the content filled here.'
      }
    ],
    outputs: []
  };
  
  export const TFSwitchModule: FlowModuleTemplateType = {
    logo: '',
    name: 'TF Switch',
    intro: 'Can determine whether the input is True or False, and execute different actions accordingly.',
    flowType: FlowModuleTypeEnum.tfSwitchNode,
    inputs: [
      {
        key: SystemInputEnum.switch,
        type: FlowInputItemTypeEnum.target,
        label: 'Input'
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
  
  export const ClassifyQuestionModule: FlowModuleTemplateType = {
    logo: '/imgs/module/cq.png',
    name: 'Question Classification',
    intro: 'Can determine the category of the user\'s question and execute different actions accordingly.',
    description:
      'Determine the type of the current question based on the user\'s history and the current question. Multiple sets of question types can be added. Here is a template example:\nType 1: Greeting\nType 2: General questions about laf\nType 3: Coding-related questions about laf\nType 4: Other questions',
    flowType: FlowModuleTypeEnum.classifyQuestion,
    showStatus: true,
    inputs: [
      {
        key: 'systemPrompt',
        type: FlowInputItemTypeEnum.textarea,
        valueType: FlowValueTypeEnum.string,
        label: 'System Prompt',
        description:
          'You can add introductions with specific content to better identify the question type. This content is usually used to introduce something unknown to the model.',
        placeholder: 'For example:\n1. Laf is a cloud function development platform...\n2. Sealos is a cluster operating system',
        value: ''
      },
      Input_Template_History,
      Input_Template_UserChatInput,
      {
        key: SpecialInputKeyEnum.agents,
        type: FlowInputItemTypeEnum.custom,
        label: '',
        value: [
          {
            value: 'Greeting',
            key: 'fasw'
          },
          {
            value: 'Questions about xxx',
            key: 'fqsw'
          },
          {
            value: 'Other questions',
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
    logo: '/imgs/module/extract.png',
    name: 'Text Content Extraction',
    intro: 'Extract specified format data from text',
    description: 'Can extract specified data from text, such as SQL queries, search keywords, code, etc.',
    flowType: FlowModuleTypeEnum.contentExtract,
    showStatus: true,
    inputs: [
      Input_Template_TFSwitch,
      {
        key: ContextExtractEnum.description,
        type: FlowInputItemTypeEnum.textarea,
        valueType: FlowValueTypeEnum.string,
        label: 'Extraction Requirements Description',
        description: 'Write a description of the extraction requirements to inform the AI about the content to be extracted',
        required: true,
        placeholder:
          'For example:\n1. You are a lab appointment assistant. Extract name, lab number, and appointment time based on user queries.',
        value: ''
      },
      Input_Template_History,
      {
        key: ContextExtractEnum.content,
        type: FlowInputItemTypeEnum.target,
        label: 'Text to Extract From',
        required: true,
        valueType: FlowValueTypeEnum.string
      },
      {
        key: ContextExtractEnum.extractKeys,
        type: FlowInputItemTypeEnum.custom,
        label: 'Target Fields',
        description: "Comprise 'description' and 'key' to form a target field. Multiple target fields can be extracted.",
        value: []
      }
    ],
    outputs: [
      {
        key: ContextExtractEnum.success,
        label: 'Fields Extracted Completely',
        valueType: FlowValueTypeEnum.boolean,
        type: FlowOutputItemTypeEnum.source,
        targets: []
      },
      {
        key: ContextExtractEnum.failed,
        label: 'Fields Extraction Missing',
        valueType: FlowValueTypeEnum.boolean,
        type: FlowOutputItemTypeEnum.source,
        targets: []
      },
      {
        key: ContextExtractEnum.fields,
        label: 'Complete Extraction Results',
        description: 'A JSON string, for example: {"name": "YY", "Time": "2023/7/2 18:00"}',
        valueType: FlowValueTypeEnum.string,
        type: FlowOutputItemTypeEnum.source,
        targets: []
      }
    ]
  };
  
  export const HttpModule: FlowModuleTemplateType = {
    logo: '/imgs/module/http.png',
    name: 'HTTP Module',
    intro: 'Can send an HTTP POST request for more complex operations (network search, database queries, etc.)',
    description: 'Can send an HTTP POST request for more complex operations (network search, database queries, etc.)',
    flowType: FlowModuleTypeEnum.httpRequest,
    showStatus: true,
    inputs: [
      {
        key: HttpPropsEnum.url,
        value: '',
        type: FlowInputItemTypeEnum.input,
        label: 'Request URL',
        description: 'Target URL for the request',
        placeholder: 'https://api.fastgpt.run/getInventory',
        required: true
      },
      Input_Template_TFSwitch
    ],
    outputs: [
      {
        key: HttpPropsEnum.finish,
        label: 'Request Finished',
        valueType: FlowValueTypeEnum.boolean,
        type: FlowOutputItemTypeEnum.source,
        targets: []
      }
    ]
  };
  
  export const EmptyModule: FlowModuleTemplateType = {
    logo: '/imgs/module/cq.png',
    name: 'This Module Has Been Removed',
    intro: '',
    description: '',
    flowType: FlowModuleTypeEnum.empty,
    inputs: [],
    outputs: []
  };
  
  export const ModuleTemplates = [
    {
      label: 'Input Modules',
      list: [UserInputModule, HistoryModule]
    },
    {
      label: 'Guide Modules',
      list: [UserGuideModule, VariableModule]
    },
    {
      label: 'Content Generation Modules',
      list: [ChatModule, AnswerModule]
    },
    {
      label: 'Knowledge Base Modules',
      list: [KBSearchModule]
    },
    {
      label: 'Agent Modules',
      list: [ClassifyQuestionModule, ContextExtractModule, HttpModule]
    }
  ];
  export const ModuleTemplatesFlat = ModuleTemplates.map((templates) => templates.list)?.flat();
  
  // Template
  export const appTemplates: (AppItemType & { avatar: string; intro: string })[] = [
    {
      id: 'simpleChat',
      avatar: '/imgs/module/AI.png',
      name: 'Simple Chat',
      intro: 'An extremely simple AI conversation application',
      modules: [
        {
          moduleId: 'userChatInput',
          name: 'User Question (Dialogue Entry)',
          flowType: 'questionInput',
          position: {
            x: 464.32198615344566,
            y: 1602.2698463081606
          },
          inputs: [
            {
              key: 'userChatInput',
              type: 'systemInput',
              label: 'User Question',
              connected: true
            }
          ],
          outputs: [
            {
              key: 'userChatInput',
              label: 'User Question',
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
          name: 'Chat History',
          flowType: 'historyNode',
          position: {
            x: 452.5466249541586,
            y: 1276.3930310334215
          },
          inputs: [
            {
              key: 'maxContext',
              type: 'numberInput',
              label: 'Maximum Records',
              value: 6,
              min: 0,
              max: 50,
              connected: true
            },
            {
              key: 'history',
              type: 'hidden',
              label: 'Chat History',
              connected: true
            }
          ],
          outputs: [
            {
              key: 'history',
              label: 'Chat History',
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
            name: 'AI Conversation',
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
                label: 'Conversation Model',
                value: 'gpt-3.5-turbo-16k',
                list: [],
                connected: true
              },
              {
                key: 'temperature',
                type: 'slider',
                label: 'Temperature',
                value: 0,
                min: 0,
                max: 10,
                step: 1,
                markList: [
                  {
                    label: 'Precise',
                    value: 0
                  },
                  {
                    label: 'Divergent',
                    value: 10
                  }
                ],
                connected: true
              },
              {
                key: 'maxToken',
                type: 'custom',
                label: 'Response Limit',
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
                label: 'System Prompts',
                valueType: 'string',
                description:
                  'Fixed prompts for the model to guide the conversation direction. This content will be fixed at the beginning of the context. Variables can be used, such as {{language}}',
                placeholder:
                  'Fixed prompts for the model to guide the conversation direction. This content will be fixed at the beginning of the context. Variables can be used, such as {{language}}',
                value: '',
                connected: true
              },
              {
                key: 'limitPrompt',
                type: 'textarea',
                valueType: 'string',
                label: 'Limiting Prompts',
                description:
                  'Limits the scope of the model conversation, placed before the current question, with strong guidance and limitations. Variables can be used, such as {{language}}. Example prompts:\n1. The knowledge base is about an introduction to Laf, refer to the knowledge base for answering questions, irrelevant to "Laf" content, respond directly: "I don\'t know".\n2. You only answer questions about "xxx", reply to other questions: "xxxx"',
                placeholder:
                  'Limits the scope of the model conversation, placed before the current question, with strong guidance and limitations. Variables can be used, such as {{language}}. Example prompts:\n1. The knowledge base is about an introduction to Laf, refer to the knowledge base for answering questions, irrelevant to "Laf" content, respond directly: "I don\'t know".\n2. You only answer questions about "xxx", reply to other questions: "xxxx"',
                value: '',
                connected: true
              },
              {
                key: 'switch',
                type: 'target',
                label: 'Trigger',
                valueType: 'any',
                connected: false
              },
              {
                key: 'quoteQA',
                type: 'target',
                label: 'Quoted Content',
                valueType: 'kb_quote',
                connected: false
              },
              {
                key: 'history',
                type: 'target',
                label: 'Chat History',
                valueType: 'chat_history',
                connected: true
              },
              {
                key: 'userChatInput',
                type: 'target',
                label: 'User Question',
                required: true,
                valueType: 'string',
                connected: true
              }
            ],
            outputs: [
              {
                key: 'answerText',
                label: 'Model Reply',
                description: 'Direct response, no configuration needed',
                type: 'hidden',
                targets: []
              },
              {
                key: 'finish',
                label: 'Reply Finished',
                description: 'Triggered after AI response is completed',
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
        name: 'Knowledge Base + Conversation Guidance',
        intro: 'Perform a knowledge base search every time a question is asked, inject the search results into the LLM model for reference answers',
        modules: [
          {
            moduleId: 'userGuide',
            name: 'User Guidance',
            flowType: 'userGuide',
            position: {
              x: 454.98510354678695,
              y: 721.4016845336229
            },
            inputs: [
              {
                key: 'welcomeText',
                type: 'input',
                label: 'Opening Statement',
                value: 'Hello, I am Laf Assistant. How can I assist you?',
                connected: true
              }
            ],
            outputs: []
          },
          {
            moduleId: 'userChatInput',
            name: 'User Question (Conversation Entry)',
            flowType: 'questionInput',
            position: {
              x: 464.32198615344566,
              y: 1602.2698463081606
            },
            inputs: [
              {
                key: 'userChatInput',
                type: 'systemInput',
                label: 'User Question',
                connected: true
              }
            ],
            outputs: [
              {
                key: 'userChatInput',
                label: 'User Question',
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
            name: 'Chat History',
            flowType: 'historyNode',
            position: {
              x: 452.5466249541586,
              y: 1276.3930310334215
            },
            inputs: [
              {
                key: 'maxContext',
                type: 'numberInput',
                label: 'Maximum Context',
                value: 6,
                min: 0,
                max: 50,
                connected: true
              },
              {
                key: 'history',
                type: 'hidden',
                label: 'Chat History',
                connected: true
              }
            ],
            outputs: [
              {
                key: 'history',
                label: 'Chat History',
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
        {
            moduleId: 'kbSearch',
            name: 'Knowledge Base Search',
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
                label: 'Associated Knowledge Bases',
                value: [],
                list: [],
                connected: true
              },
              {
                key: 'similarity',
                type: 'slider',
                label: 'Similarity',
                value: 0.8,
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
                label: 'Search Limit per Query',
                description: 'Retrieve up to n records as references for this question',
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
                label: 'Trigger',
                valueType: 'any',
                connected: false
              },
              {
                key: 'userChatInput',
                type: 'target',
                label: 'User Question',
                required: true,
                valueType: 'string',
                connected: true
              }
            ],
            outputs: [
              {
                key: 'isEmpty',
                label: 'Search Results Empty',
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
                label: 'Search Results Not Empty',
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
                label: 'Quoted Content',
                description:
                  'Always returns an array. If additional actions are desired when search results are empty, use the above inputs and target module triggers',
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
        {
            moduleId: 'chatModule',
            name: 'AI Conversation',
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
                label: 'Conversation Model',
                value: 'gpt-3.5-turbo-16k',
                list: [],
                connected: true
              },
              {
                key: 'temperature',
                type: 'slider',
                label: 'Temperature',
                value: 0,
                min: 0,
                max: 10,
                step: 1,
                markList: [
                  {
                    label: 'Precise',
                    value: 0
                  },
                  {
                    label: 'Divergent',
                    value: 10
                  }
                ],
                connected: true
              },
              {
                key: 'maxToken',
                type: 'custom',
                label: 'Response Limit',
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
                label: 'System Prompt',
                valueType: 'string',
                description:
                  'A fixed guiding phrase for the model to guide the conversation. Adjusting this content can influence the model\'s direction. This content will be fixed at the beginning of the context. Variables can be used, such as {{language}}.',
                placeholder:
                  'A fixed guiding phrase for the model to guide the conversation. Adjusting this content can influence the model\'s direction. This content will be fixed at the beginning of the context. Variables can be used, such as {{language}}.',
                value: '',
                connected: true
              },
              {
                key: 'limitPrompt',
                type: 'textarea',
                valueType: 'string',
                label: 'Limiting Phrase',
                description:
                  'Limits the scope of the model\'s conversation. Placed before the current question, it provides strong guidance and constraint. Variables can be used, such as {{language}}. Guidance examples:\n1. The knowledge base is about introducing Laf, refer to the knowledge base to answer questions related to Laf, unrelated content to "Laf" should be directly responded with "I don\'t know".\n2. You only answer questions about "xxx", reply "xxxx" for other questions.',
                placeholder:
                  'Limits the scope of the model\'s conversation. Placed before the current question, it provides strong guidance and constraint. Variables can be used, such as {{language}}. Guidance examples:\n1. The knowledge base is about introducing Laf, refer to the knowledge base to answer questions related to Laf, unrelated content to "Laf" should be directly responded with "I don\'t know".\n2. You only answer questions about "xxx", reply "xxxx" for other questions.',
                value: '',
                connected: true
              },
              {
                key: 'switch',
                type: 'target',
                label: 'Trigger',
                valueType: 'any',
                connected: true
              },
              {
                key: 'quoteQA',
                type: 'target',
                label: 'Quoted Content',
                valueType: 'kb_quote',
                connected: true
              },
              {
                key: 'history',
                type: 'target',
                label: 'Chat History',
                valueType: 'chat_history',
                connected: true
              },
              {
                key: 'userChatInput',
                type: 'target',
                label: 'User Question',
                required: true,
                valueType: 'string',
                connected: true
              }
            ],
            outputs: [
              {
                key: 'answerText',
                label: 'Model Response',
                description: 'Direct response, no configuration required',
                type: 'hidden',
                targets: []
              },
              {
                key: 'finish',
                label: 'Response Finished',
                description: 'Triggered after the AI completes the response',
                valueType: 'boolean',
                type: 'source',
                targets: []
              }
            ]
          },          
      {
        {
            moduleId: '2752oj',
            name: 'Specified Response',
            flowType: 'answerNode',
            position: {
              x: 1542.9271243684725,
              y: 702.7819618017722
            },
            inputs: [
              {
                key: 'switch',
                type: 'target',
                label: 'Trigger',
                valueType: 'any',
                connected: true
              },
              {
                key: 'text',
                value: 'Search results are empty',
                type: 'textarea',
                valueType: 'string',
                label: 'Response Content',
                description:
                  'You can use \\n to create line breaks. You can also provide input from external modules to override the content entered here.',
                connected: true
              }
            ],
            outputs: []
          },
          {
            id: 'chatGuide',
            avatar: '/imgs/module/userGuide.png',
            name: 'Dialogue Guide + Variables',
            intro: 'You can send a prompt at the beginning of the conversation or ask the user to provide some content as variables for the conversation.',
            modules: [
              {
                moduleId: 'userGuide',
                name: 'User Guide',
                flowType: 'userGuide',
                position: {
                  x: 447.98520778293346,
                  y: 721.4016845336229
                },
                inputs: [
                  {
                    key: 'welcomeText',
                    type: 'input',
                    label: 'Opening Message',
                    value: 'Hello, I can translate various languages for you. Please tell me what language you need the translation for?',
                    connected: true
                  }
                ],
                outputs: []
              },
              {
                moduleId: 'variable',
                name: 'Global Variables',
                flowType: 'variable',
                position: {
                  x: 444.0369195277651,
                  y: 1008.5185781784537
                },
                inputs: [
                  {
                    key: 'variables',
                    type: 'systemInput',
                    label: 'Variable Input',
                    value: [
                      {
                        id: '35c640eb-cf22-431f-bb57-3fc21643880e',
                        key: 'language',
                        label: 'Target Language',
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
                        label: 'Dropdown Test',
                        type: 'select',
                        required: false,
                        maxLen: 50,
                        enums: [
                          {
                            value: 'English'
                          },
                          {
                            value: 'French'
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
        {
            moduleId: 'userChatInput',
            name: 'User Question (Conversation Entry)',
            flowType: 'questionInput',
            position: {
              x: 464.32198615344566,
              y: 1602.2698463081606
            },
            inputs: [
              {
                key: 'userChatInput',
                type: 'systemInput',
                label: 'User Question',
                connected: true
              }
            ],
            outputs: [
              {
                key: 'userChatInput',
                label: 'User Question',
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
            name: 'Chat History',
            flowType: 'historyNode',
            position: {
              x: 452.5466249541586,
              y: 1276.3930310334215
            },
            inputs: [
              {
                key: 'maxContext',
                type: 'numberInput',
                label: 'Maximum Records',
                value: 10,
                min: 0,
                max: 50,
                connected: true
              },
              {
                key: 'history',
                type: 'hidden',
                label: 'Chat History',
                connected: true
              }
            ],
            outputs: [
              {
                key: 'history',
                label: 'Chat History',
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
        {
            moduleId: 'chatModule',
            name: 'AI Conversation',
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
                label: 'Conversation Model',
                value: 'gpt-3.5-turbo-16k',
                list: [],
                connected: true
              },
              {
                key: 'temperature',
                type: 'slider',
                label: 'Temperature',
                value: 0,
                min: 0,
                max: 10,
                step: 1,
                markList: [
                  {
                    label: 'Precise',
                    value: 0
                  },
                  {
                    label: 'Divergent',
                    value: 10
                  }
                ],
                connected: true
              },
              {
                key: 'maxToken',
                type: 'custom',
                label: 'Response Limit',
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
                label: 'System Prompt',
                valueType: 'string',
                description:
                  'Fixed guiding words for the model to guide the conversation direction. This content will be fixed at the beginning of the context. Variables like {{language}} can be used.',
                placeholder:
                  'Fixed guiding words for the model to guide the conversation direction. This content will be fixed at the beginning of the context. Variables like {{language}} can be used.',
                value: '',
                connected: true
              },
              {
                key: 'limitPrompt',
                type: 'textarea',
                valueType: 'string',
                label: 'Limiting Prompt',
                description:
                  'Limit the scope of the model\'s conversation. This will be placed before the current question and provides strong guidance and limitations. Variables like {{language}} can be used. Guidance examples:\n1. The knowledge base is about Laf\'s introduction, refer to the knowledge base to answer questions. For unrelated content to "Laf", reply directly: "I don\'t know".\n2. You only answer questions about "xxx", for other questions reply: "xxxx"',
                placeholder:
                  'Limit the scope of the model\'s conversation. This will be placed before the current question and provides strong guidance and limitations. Variables like {{language}} can be used. Guidance examples:\n1. The knowledge base is about Laf\'s introduction, refer to the knowledge base to answer questions. For unrelated content to "Laf", reply directly: "I don\'t know".\n2. You only answer questions about "xxx", for other questions reply: "xxxx"',
                value: 'Translate my question directly into English {{language}}',
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
            key: 'limitPrompt',
            type: 'textarea',
            valueType: 'string',
            label: '限定词',
            description:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            placeholder:
              '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"',
            value:
              '我的问题都是关于 laf 的。根据知识库回答我的问题，与 laf 无关问题，直接回复：“我不清楚，我仅能回答 laf 相关的问题。”。',
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
