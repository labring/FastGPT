import type { AppItemType } from '@/types/app';

/* app */
export enum AppModuleItemTypeEnum {
  'userGuide' = 'userGuide', // default chat input: userChatInput, history
  'initInput' = 'initInput', // default chat input: userChatInput, history
  'http' = 'http', // send a http request
  'switch' = 'switch', // one input and two outputs
  'answer' = 'answer' // redirect response
}
export enum SystemInputEnum {
  'welcomeText' = 'welcomeText',
  'variables' = 'variables',
  'switch' = 'switch', // a trigger switch
  'history' = 'history',
  'userChatInput' = 'userChatInput'
}
export enum SpecificInputEnum {
  'answerText' = 'answerText' //  answer module text key
}
export enum VariableInputEnum {
  input = 'input',
  select = 'select'
}

// template
export const appTemplates: (AppItemType & { avatar: string; intro: string })[] = [
  {
    id: 'simpleChat',
    avatar: '/imgs/module/AI.png',
    name: '简单的对话',
    intro: '一个极其简单的 AI 对话应用',
    modules: [
      {
        logo: '/imgs/module/userChatInput.png',
        name: '用户问题',
        intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
        type: 'initInput',
        flowType: 'questionInput',
        url: '/openapi/modules/init/userChatInput',
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
              }
            ]
          }
        ],
        position: {
          x: 481.4684021933373,
          y: 741.252592445572
        },
        moduleId: 'xzj0oo'
      },
      {
        logo: '/imgs/module/history.png',
        name: '聊天记录',
        intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
        type: 'initInput',
        flowType: 'historyNode',
        url: '/openapi/modules/init/history',
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
          x: 405.6002299937601,
          y: 374.16606887857023
        },
        moduleId: 'hh6of9'
      },
      {
        logo: '/imgs/module/AI.png',
        name: 'AI 对话',
        intro: 'OpenAI GPT 大模型对话。',
        flowType: 'chatNode',
        type: 'http',
        url: '/openapi/modules/chat/gpt',
        inputs: [
          {
            key: 'model',
            type: 'select',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [
              {
                label: 'Gpt35-16k',
                value: 'gpt-3.5-turbo-16k'
              },
              {
                label: 'Gpt35-4k',
                value: 'gpt-3.5-turbo'
              },
              {
                label: 'Gpt4-8k',
                value: 'gpt-4'
              }
            ],
            connected: false
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
            connected: false
          },
          {
            key: 'maxToken',
            type: 'slider',
            label: '回复上限',
            value: 3000,
            min: 0,
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
          x: 965.5863241865428,
          y: -29.569293606933797
        },
        moduleId: '3n49vn'
      }
    ]
  },
  {
    id: 'simpleKbChat',
    avatar: '/imgs/module/db.png',
    name: '基础知识库',
    intro: '每次提问时进行一次知识库搜索，将搜索结果注入 LLM 模型进行参考回答',
    modules: [
      {
        logo: '/imgs/module/userChatInput.png',
        name: '用户问题',
        intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
        type: 'initInput',
        flowType: 'questionInput',
        url: '/openapi/modules/init/userChatInput',
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
                moduleId: 'zid0fj',
                key: 'userChatInput'
              }
            ]
          }
        ],
        position: {
          x: 447.0165784462213,
          y: 748.7421193471189
        },
        moduleId: 'xzj0oo'
      },
      {
        logo: '/imgs/module/history.png',
        name: '聊天记录',
        intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
        type: 'initInput',
        flowType: 'historyNode',
        url: '/openapi/modules/init/history',
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
          x: 1182.3679138395933,
          y: 882.21575235563
        },
        moduleId: 'hh6of9'
      },
      {
        logo: '/imgs/module/AI.png',
        name: 'AI 对话',
        intro: 'OpenAI GPT 大模型对话。',
        flowType: 'chatNode',
        type: 'http',
        url: '/openapi/modules/chat/gpt',
        inputs: [
          {
            key: 'model',
            type: 'select',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [
              {
                label: 'Gpt35-16k',
                value: 'gpt-3.5-turbo-16k'
              },
              {
                label: 'Gpt35-4k',
                value: 'gpt-3.5-turbo'
              },
              {
                label: 'Gpt4-8k',
                value: 'gpt-4'
              }
            ],
            connected: false
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
            connected: false
          },
          {
            key: 'maxToken',
            type: 'slider',
            label: '回复上限',
            value: 3000,
            min: 0,
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
          x: 1611.18354309989,
          y: -56.531590452502826
        },
        moduleId: '3n49vn'
      },
      {
        logo: '/imgs/module/db.png',
        name: '知识库搜索',
        intro: '去知识库中搜索对应的答案。可作为 AI 对话引用参考。',
        flowType: 'kbSearchNode',
        type: 'http',
        url: '/openapi/modules/kb/search',
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
            type: 'slider',
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
            type: 'slider',
            label: '单次搜索上限',
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
            key: 'rawSearch',
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
                moduleId: 'gbnzif',
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
          x: 718.7528704477357,
          y: 112.64438442321625
        },
        moduleId: 'zid0fj'
      },
      {
        logo: '/imgs/module/reply.png',
        name: '指定回复',
        intro: '该模块可以直接回复一段指定的内容。常用于引导、提示。',
        type: 'answer',
        flowType: 'answerNode',
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'answerText',
            value: '对不起，你的问题不在知识库中。',
            type: 'input',
            label: '回复的内容',
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: 1171.1202953011716,
          y: 213.00404490394536
        },
        moduleId: 'gbnzif'
      }
    ]
  },
  {
    id: 'chatGuide',
    avatar: '/imgs/module/db.png',
    name: '问答前引导',
    intro: '可以在每次对话开始前提示用户填写一些内容，作为本次对话的永久内容',
    modules: []
  },
  {
    id: 'CQ',
    avatar: '/imgs/module/cq.png',
    name: '意图识别 + 知识库',
    intro: '先对用户的问题进行分类，再根据不同类型问题，执行不同的操作',
    modules: [
      {
        logo: '/imgs/module/userChatInput.png',
        name: '用户问题',
        intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
        type: 'initInput',
        flowType: 'questionInput',
        url: '/openapi/modules/init/userChatInput',
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
                moduleId: 'zid0fj',
                key: 'userChatInput'
              },
              {
                moduleId: 'gm15of',
                key: 'userChatInput'
              }
            ]
          }
        ],
        position: {
          x: -33.86673792997432,
          y: 874.685676808633
        },
        moduleId: 'xzj0oo'
      },
      {
        logo: '/imgs/module/history.png',
        name: '聊天记录',
        intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
        type: 'initInput',
        flowType: 'historyNode',
        url: '/openapi/modules/init/history',
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
          x: 1388.8842960266352,
          y: 854.1553026226809
        },
        moduleId: 'hh6of9'
      },
      {
        logo: '/imgs/module/AI.png',
        name: 'AI 对话',
        intro: 'OpenAI GPT 大模型对话。',
        flowType: 'chatNode',
        type: 'http',
        url: '/openapi/modules/chat/gpt',
        inputs: [
          {
            key: 'model',
            type: 'select',
            label: '对话模型',
            value: 'gpt-3.5-turbo-16k',
            list: [
              {
                label: 'Gpt35-16k',
                value: 'gpt-3.5-turbo-16k'
              },
              {
                label: 'Gpt35-4k',
                value: 'gpt-3.5-turbo'
              },
              {
                label: 'Gpt4-8k',
                value: 'gpt-4'
              }
            ],
            connected: false
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
            connected: false
          },
          {
            key: 'maxToken',
            type: 'slider',
            label: '回复上限',
            value: 3000,
            min: 0,
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
            value: '知识库是关于 Laf 的介绍，根据知识库内容回答问题。',
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
          x: 1827.0428559231655,
          y: 446.8058354748067
        },
        moduleId: '3n49vn'
      },
      {
        logo: '/imgs/module/db.png',
        name: '知识库搜索',
        intro: '去知识库中搜索对应的答案。可作为 AI 对话引用参考。',
        flowType: 'kbSearchNode',
        type: 'http',
        url: '/openapi/modules/kb/search',
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
            type: 'slider',
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
            type: 'slider',
            label: '单次搜索上限',
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
            key: 'rawSearch',
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
                moduleId: 'gbnzif',
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
          x: 850.3203039824494,
          y: 919.7043887997417
        },
        moduleId: 'zid0fj'
      },
      {
        logo: '/imgs/module/reply.png',
        name: '指定回复',
        intro: '该模块可以直接回复一段指定的内容。常用于引导、提示。',
        type: 'answer',
        flowType: 'answerNode',
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'answerText',
            value: '对不起，我找不到你的问题。',
            type: 'input',
            label: '回复的内容',
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: 1392.0649222586217,
          y: 553.0130337399224
        },
        moduleId: 'gbnzif'
      },
      {
        logo: '/imgs/module/cq.png',
        name: '意图识别',
        intro: '可以判断用户问题属于哪方面问题，从而执行不同的操作。',
        type: 'http',
        url: '/openapi/modules/agent/classifyQuestion',
        flowType: 'classifyQuestionNode',
        inputs: [
          {
            key: 'systemPrompt',
            type: 'textarea',
            label: '系统提示词',
            description:
              '你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。',
            placeholder: '例如: \n1. Laf 是一个云函数开发平台……\n2. Sealos 是一个集群操作系统',
            value:
              'Laf 一个云函数开发平台，提供了基于 Node 的 serveless 的快速开发和部署。是一个集「函数计算」、「数据库」、「对象存储」等于一身的一站式开发平台。支持云函数、云数据库、在线编程 IDE、触发器、云存储和静态网站托管等功能。',
            connected: false
          },
          {
            key: 'history',
            type: 'target',
            label: '聊天记录',
            connected: false
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
                value: '打招呼、问候、身份询问等问题',
                key: 'a'
              },
              {
                value: '商务类、联系方式问题',
                key: 'b'
              },
              {
                value: '其他问题',
                key: 'ek3f'
              },
              {
                value: '关于 Laf 云函数问题',
                key: 'psau'
              }
            ],
            connected: false
          }
        ],
        outputs: [
          {
            key: 'a',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: '6jnrp5',
                key: 'switch'
              }
            ]
          },
          {
            key: 'b',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: 'g13ipe',
                key: 'switch'
              }
            ]
          },
          {
            key: 'ek3f',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: 'gbnzif',
                key: 'switch'
              }
            ]
          },
          {
            key: 'psau',
            label: '',
            type: 'hidden',
            targets: [
              {
                moduleId: 'zid0fj',
                key: 'switch'
              }
            ]
          }
        ],
        position: {
          x: 366.0894497581114,
          y: 250.81741383805945
        },
        moduleId: 'gm15of'
      },
      {
        logo: '/imgs/module/reply.png',
        name: '指定回复',
        intro: '该模块可以直接回复一段指定的内容。常用于引导、提示。',
        type: 'answer',
        flowType: 'answerNode',
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'answerText',
            value: '你好，我是 Laf 助手，可以回答你 Laf 相关问题。',
            type: 'input',
            label: '回复的内容',
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: 855.9439119466947,
          y: 15.463108315267931
        },
        moduleId: '6jnrp5'
      },
      {
        logo: '/imgs/module/reply.png',
        name: '指定回复',
        intro: '该模块可以直接回复一段指定的内容。常用于引导、提示。',
        type: 'answer',
        flowType: 'answerNode',
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: '触发器',
            connected: true
          },
          {
            key: 'answerText',
            value: '联系方式：xxxxx',
            type: 'input',
            label: '回复的内容',
            connected: false
          }
        ],
        outputs: [],
        position: {
          x: 854.0492662385566,
          y: 320.5010673254856
        },
        moduleId: 'g13ipe'
      }
    ]
  }
];
