// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, App } from '@/service/mongo';
import { appTemplates } from '@/constants/app';
import { rawSearchKey } from '@/constants/chat';

const chatTemplate = ({
  model,
  temperature,
  maxToken,
  systemPrompt,
  limitPrompt
}: {
  model: string;
  temperature: number;
  maxToken: number;
  systemPrompt: string;
  limitPrompt: string;
}) => {
  return [
    {
      logo: '/imgs/module/userChatInput.png',
      name: '用户问题',
      intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
      type: 'initInput',
      flowType: 'questionInput',
      url: '/app/modules/init/userChatInput',
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
      logo: '/imgs/module/AI.png',
      name: 'AI 对话',
      intro: 'AI 大模型对话',
      flowType: 'chatNode',
      type: 'http',
      url: '/app/modules/chat/gpt',
      inputs: [
        {
          key: 'model',
          type: 'custom',
          label: '对话模型',
          value: model,
          list: [
            {
              label: 'Gpt35-4k',
              value: 'gpt-3.5-turbo'
            },
            {
              label: 'Gpt35-16k',
              value: 'gpt-3.5-turbo-16k'
            },
            {
              label: 'Gpt4',
              value: 'gpt-4'
            }
          ],
          connected: false
        },
        {
          key: 'temperature',
          type: 'slider',
          label: '温度',
          value: temperature,
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
          value: maxToken,
          min: 0,
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
          value: systemPrompt,
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
          value: limitPrompt,
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
      logo: '/imgs/module/history.png',
      name: '聊天记录',
      intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
      type: 'initInput',
      flowType: 'historyNode',
      url: '/app/modules/init/history',
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
  ];
};
const kbTemplate = ({
  model,
  temperature,
  maxToken,
  systemPrompt,
  limitPrompt,
  kbs = [],
  searchSimilarity,
  searchLimit,
  searchEmptyText
}: {
  model: string;
  temperature: number;
  maxToken: number;
  systemPrompt: string;
  limitPrompt: string;
  kbs: string[];
  searchSimilarity: number;
  searchLimit: number;
  searchEmptyText: string;
}) => {
  return [
    {
      logo: '/imgs/module/userChatInput.png',
      name: '用户问题',
      intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
      type: 'initInput',
      flowType: 'questionInput',
      url: '/app/modules/init/userChatInput',
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
        x: -210.24817109253843,
        y: 665.7922967022607
      },
      moduleId: 'v0nc1s'
    },
    {
      logo: '/imgs/module/history.png',
      name: '聊天记录',
      intro: '用户输入的内容。该模块通常作为应用的入口，用户在发送消息后会首先执行该模块。',
      type: 'initInput',
      flowType: 'historyNode',
      url: '/app/modules/init/history',
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
      logo: '/imgs/module/AI.png',
      name: 'AI 对话',
      intro: 'AI 大模型对话',
      flowType: 'chatNode',
      type: 'http',
      url: '/app/modules/chat/gpt',
      inputs: [
        {
          key: 'model',
          type: 'custom',
          label: '对话模型',
          value: model,
          list: [
            {
              label: 'Gpt35-4k',
              value: 'gpt-3.5-turbo'
            },
            {
              label: 'Gpt35-16k',
              value: 'gpt-3.5-turbo-16k'
            },
            {
              label: 'Gpt4',
              value: 'gpt-4'
            }
          ],
          connected: false
        },
        {
          key: 'temperature',
          type: 'slider',
          label: '温度',
          value: temperature,
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
          value: maxToken,
          min: 0,
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
          value: systemPrompt,
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
          value: limitPrompt,
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
        x: 830.725790038998,
        y: 201.0790739617387
      },
      moduleId: 'qbf8td'
    },
    {
      logo: '/imgs/module/db.png',
      name: '知识库搜索',
      intro: '去知识库中搜索对应的答案。可作为 AI 对话引用参考。',
      flowType: 'kbSearchNode',
      type: 'http',
      url: '/app/modules/kb/search',
      inputs: [
        {
          key: 'kb_ids',
          type: 'custom',
          label: '关联的知识库',
          value: kbs,
          list: [],
          connected: false
        },
        {
          key: 'similarity',
          type: 'slider',
          label: '相似度',
          value: searchSimilarity,
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
          value: searchLimit,
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
            ...(searchEmptyText
              ? [
                  {
                    moduleId: 'w8av9y',
                    key: 'switch'
                  }
                ]
              : [])
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
    searchEmptyText
      ? [
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
                value: searchEmptyText,
                type: 'input',
                label: '回复的内容',
                connected: false
              }
            ],
            outputs: [],
            position: {
              x: 827.8570503787319,
              y: -63.837994077710675
            },
            moduleId: 'w8av9y'
          }
        ]
      : []
  ];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req, authRoot: true });
    await connectToDatabase();

    // 遍历所有的 app
    const apps = await App.find(
      {
        chat: { $ne: null },
        modules: { $ne: null }
      },
      '_id chat'
    ).limit(2);

    const result = await Promise.all(
      apps.map(async (app) => {
        const modules = (() => {
          if (app.chat.relatedKbs.length === 0) {
            return chatTemplate({
              model: app.chat.chatModel,
              temperature: app.chat.temperature,
              maxToken: app.chat.maxToken,
              systemPrompt: app.chat.systemPrompt,
              limitPrompt: app.chat.limitPrompt
            });
          } else {
            return kbTemplate({
              model: app.chat.chatModel,
              temperature: app.chat.temperature,
              maxToken: app.chat.maxToken,
              systemPrompt: app.chat.systemPrompt,
              limitPrompt: app.chat.limitPrompt,
              kbs: app.chat.relatedKbs,
              searchEmptyText: app.chat.searchEmptyText,
              searchLimit: app.chat.searchLimit,
              searchSimilarity: app.chat.searchSimilarity
            });
          }
        })();

        return modules;
      })
    );

    console.log(apps);

    jsonRes(res, {
      data: {
        apps,
        result
      }
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
