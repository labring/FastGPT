/* 
    universal mode.
    @author: FastGpt Team
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type.d';
import type { ModuleItemType } from '@fastgpt/global/core/module/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { FormatForm2ModulesProps } from '@fastgpt/global/core/app/api';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { formData, chatModelMaxToken, chatModelList } = req.body as FormatForm2ModulesProps;

    const modules = [
      ...(formData.dataset.datasets.length > 0
        ? datasetTemplate({ formData, maxToken: chatModelMaxToken })
        : simpleChatTemplate({ formData, maxToken: chatModelMaxToken }))
    ];

    jsonRes<ModuleItemType[]>(res, {
      data: modules
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

function simpleChatTemplate({
  formData,
  maxToken
}: {
  formData: AppSimpleEditFormType;
  maxToken: number;
}): ModuleItemType[] {
  return [
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
          connected: false
        },
        {
          key: 'model',
          type: 'selectChatModel',
          label: '对话模型',
          required: true,
          value: formData.aiSettings.model,
          connected: true
        },
        {
          key: 'temperature',
          type: 'hidden',
          label: '温度',
          value: 1,
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
          type: 'hidden',
          label: '回复上限',
          value: maxToken,
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
          key: 'isResponseAnswerText',
          type: 'hidden',
          label: '返回AI内容',
          valueType: 'boolean',
          value: true,
          connected: true
        },
        {
          key: 'quoteTemplate',
          type: 'hidden',
          label: '引用内容模板',
          valueType: 'string',
          connected: true
        },
        {
          key: 'quotePrompt',
          type: 'hidden',
          label: '引用内容提示词',
          valueType: 'string',
          connected: true
        },
        {
          key: 'aiSettings',
          type: 'aiSettings',
          label: '',
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
          value: formData.aiSettings.systemPrompt,
          connected: true
        },
        {
          key: 'quoteQA',
          type: 'target',
          label: '引用内容',
          description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
          valueType: 'datasetQuote',
          connected: false
        },
        {
          key: 'history',
          type: 'target',
          label: 'core.module.input.label.chat history',
          valueType: 'chatHistory',
          connected: true,
          value: 8
        },
        {
          key: 'userChatInput',
          type: 'target',
          label: 'core.module.input.label.user question',
          required: true,
          valueType: 'string',
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
  ];
}
function datasetTemplate({
  formData,
  maxToken
}: {
  formData: AppSimpleEditFormType;
  maxToken: number;
}): ModuleItemType[] {
  return [
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
              moduleId: 'datasetSearch',
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
        x: 956.0838440206068,
        y: 887.462827870246
      },
      inputs: [
        {
          key: 'datasets',
          value: formData.dataset.datasets,
          type: FlowNodeInputTypeEnum.custom,
          label: '关联的知识库',
          connected: true
        },
        {
          key: 'similarity',
          value: 0.1,
          type: FlowNodeInputTypeEnum.slider,
          label: '相关度',
          connected: true
        },
        {
          key: 'limit',
          value: 2000,
          type: FlowNodeInputTypeEnum.slider,
          label: '单次搜索上限',
          connected: true
        },
        {
          key: 'switch',
          type: FlowNodeInputTypeEnum.target,
          label: '触发器',
          connected: false
        },
        {
          key: 'userChatInput',
          type: FlowNodeInputTypeEnum.target,
          label: '用户问题',
          connected: true
        },
        {
          key: 'searchMode',
          type: 'hidden',
          label: 'core.dataset.search.Mode',
          valueType: 'string',
          showTargetInApp: false,
          showTargetInPlugin: false,
          value: DatasetSearchModeEnum.embFullTextReRank,
          connected: false
        },
        {
          key: 'datasetParamsModal',
          type: 'selectDatasetParamsModal',
          label: '',
          connected: false,
          valueType: 'any',
          showTargetInApp: false,
          showTargetInPlugin: false
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
        x: 1551.71405495818,
        y: 977.4911578918461
      },
      inputs: [
        {
          key: 'switch',
          type: 'target',
          label: 'core.module.input.label.switch',
          valueType: 'any',
          connected: false
        },
        {
          key: 'model',
          type: 'selectChatModel',
          label: '对话模型',
          required: true,
          value: formData.aiSettings.model,
          connected: true
        },
        {
          key: 'temperature',
          type: 'hidden',
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
          type: 'hidden',
          label: '回复上限',
          value: maxToken,
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
          key: 'isResponseAnswerText',
          type: 'hidden',
          label: '返回AI内容',
          valueType: 'boolean',
          value: true,
          connected: true
        },
        {
          key: 'quoteTemplate',
          type: 'hidden',
          label: '引用内容模板',
          valueType: 'string',
          connected: true
        },
        {
          key: 'quotePrompt',
          type: 'hidden',
          label: '引用内容提示词',
          valueType: 'string',
          connected: true
        },
        {
          key: 'aiSettings',
          type: 'aiSettings',
          label: '',
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
          value: formData.aiSettings.systemPrompt,
          connected: true
        },
        {
          key: 'quoteQA',
          type: 'target',
          label: '引用内容',
          description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
          valueType: 'datasetQuote',
          connected: true
        },
        {
          key: 'history',
          type: 'target',
          label: 'core.module.input.label.chat history',
          valueType: 'chatHistory',
          connected: true,
          value: 8
        },
        {
          key: 'userChatInput',
          type: 'target',
          label: 'core.module.input.label.user question',
          required: true,
          valueType: 'string',
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
  ];
}
