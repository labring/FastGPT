/* 
    universal mode.
    @author: FastGpt Team
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type.d';
import type { ModuleItemType } from '@fastgpt/global/core/module/type';
import { FormatForm2ModulesProps } from '@fastgpt/global/core/app/api';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constant';
import { getExtractModel } from '@/service/core/ai/model';

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

type Props = { formData: AppSimpleEditFormType; maxToken: number };

function simpleChatTemplate({ formData, maxToken }: Props): ModuleItemType[] {
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
          valueType: 'string',
          label: '用户问题',
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
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
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'model',
          type: 'selectChatModel',
          label: '对话模型',
          required: true,
          valueType: 'string',
          showTargetInApp: false,
          showTargetInPlugin: false,
          value: formData.aiSettings.model,
          connected: false
        },
        {
          key: 'temperature',
          type: 'hidden',
          label: '温度',
          value: 1,
          valueType: 'number',
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
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'maxToken',
          type: 'hidden',
          label: '回复上限',
          value: maxToken,
          valueType: 'number',
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
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'isResponseAnswerText',
          type: 'hidden',
          label: '返回AI内容',
          value: true,
          valueType: 'boolean',
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'quoteTemplate',
          type: 'hidden',
          label: '引用内容模板',
          valueType: 'string',
          showTargetInApp: false,
          showTargetInPlugin: false,
          value: formData.aiSettings.quoteTemplate,
          connected: false
        },
        {
          key: 'quotePrompt',
          type: 'hidden',
          label: '引用内容提示词',
          valueType: 'string',
          showTargetInApp: false,
          showTargetInPlugin: false,
          value: formData.aiSettings.quotePrompt,
          connected: false
        },
        {
          key: 'aiSettings',
          type: 'aiSettings',
          label: '',
          valueType: 'any',
          showTargetInApp: false,
          showTargetInPlugin: false,
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
          showTargetInApp: true,
          showTargetInPlugin: true,
          value: formData.aiSettings.systemPrompt,
          connected: false
        },
        {
          key: 'history',
          type: 'numberInput',
          label: 'core.module.input.label.chat history',
          required: true,
          min: 0,
          max: 30,
          valueType: 'chatHistory',
          value: 8,
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'quoteQA',
          type: 'target',
          label: '引用内容',
          description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
          valueType: 'datasetQuote',
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'userChatInput',
          type: 'target',
          label: 'core.module.input.label.user question',
          required: true,
          valueType: 'string',
          showTargetInApp: true,
          showTargetInPlugin: true,
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
function datasetTemplate({ formData, maxToken }: Props): ModuleItemType[] {
  const modules: ModuleItemType[] = [
    {
      moduleId: 'userChatInput',
      name: '用户问题(对话入口)',
      avatar: '/imgs/module/userChatInput.png',
      flowType: 'questionInput',
      position: {
        x: 324.81436595478294,
        y: 1527.0012457753612
      },
      inputs: [
        {
          key: 'userChatInput',
          type: 'systemInput',
          valueType: 'string',
          label: '用户问题',
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
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
              moduleId: 'vuc92c',
              key: 'userChatInput'
            },
            {
              moduleId: 'chatModule',
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
        x: 1351.5043753345153,
        y: 947.0780385418003
      },
      inputs: [
        {
          key: 'switch',
          type: 'target',
          label: 'core.module.input.label.switch',
          valueType: 'any',
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'datasets',
          type: 'selectDataset',
          label: '关联的知识库',
          value: formData.dataset.datasets,
          valueType: 'selectDataset',
          list: [],
          required: true,
          showTargetInApp: false,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'similarity',
          type: 'hidden',
          label: '最低相关性',
          value: 0.15,
          valueType: 'number',
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
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'limit',
          type: 'hidden',
          label: '引用上限',
          description: '单次搜索最大的 Tokens 数量，中文约1字=1.7Tokens，英文约1字=1Tokens',
          value: 2000,
          valueType: 'number',
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'searchMode',
          type: 'hidden',
          label: '',
          valueType: 'string',
          showTargetInApp: false,
          showTargetInPlugin: false,
          value: DatasetSearchModeEnum.mixedRecall,
          connected: false
        },
        {
          key: 'usingReRank',
          type: 'hidden',
          label: '',
          valueType: 'string',
          showTargetInApp: false,
          showTargetInPlugin: false,
          value: true,
          connected: false
        },
        {
          key: 'datasetParamsModal',
          type: 'selectDatasetParamsModal',
          label: '',
          valueType: 'any',
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'userChatInput',
          type: 'target',
          label: 'core.module.input.label.user question',
          required: true,
          valueType: 'string',
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: true
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
        x: 2022.7264786978908,
        y: 1006.3102431257475
      },
      inputs: [
        {
          key: 'switch',
          type: 'target',
          label: 'core.module.input.label.switch',
          valueType: 'any',
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'model',
          type: 'selectChatModel',
          label: '对话模型',
          required: true,
          valueType: 'string',
          showTargetInApp: false,
          showTargetInPlugin: false,
          value: formData.aiSettings.model,
          connected: false
        },
        {
          key: 'temperature',
          type: 'hidden',
          label: '温度',
          value: 0,
          valueType: 'number',
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
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'maxToken',
          type: 'hidden',
          label: '回复上限',
          value: maxToken,
          valueType: 'number',
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
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'isResponseAnswerText',
          type: 'hidden',
          label: '返回AI内容',
          value: true,
          valueType: 'boolean',
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'quoteTemplate',
          type: 'hidden',
          label: '引用内容模板',
          valueType: 'string',
          showTargetInApp: false,
          showTargetInPlugin: false,
          value: '',
          connected: false
        },
        {
          key: 'quotePrompt',
          type: 'hidden',
          label: '引用内容提示词',
          valueType: 'string',
          showTargetInApp: false,
          showTargetInPlugin: false,
          value: '',
          connected: false
        },
        {
          key: 'aiSettings',
          type: 'aiSettings',
          label: '',
          valueType: 'any',
          showTargetInApp: false,
          showTargetInPlugin: false,
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
          showTargetInApp: true,
          showTargetInPlugin: true,
          value: formData.aiSettings.systemPrompt,
          connected: false
        },
        {
          key: 'history',
          type: 'numberInput',
          label: 'core.module.input.label.chat history',
          required: true,
          min: 0,
          max: 30,
          valueType: 'chatHistory',
          value: 6,
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'quoteQA',
          type: 'target',
          label: '引用内容',
          description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
          valueType: 'datasetQuote',
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: true
        },
        {
          key: 'userChatInput',
          type: 'target',
          label: 'core.module.input.label.user question',
          required: true,
          valueType: 'string',
          showTargetInApp: true,
          showTargetInPlugin: true,
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
    },
    {
      moduleId: 'vuc92c',
      name: 'core.module.template.cfr',
      avatar: '/imgs/module/cfr.svg',
      flowType: 'cfr',
      showStatus: true,
      position: {
        x: 758.2985382279098,
        y: 1124.6527309337314
      },
      inputs: [
        {
          key: 'switch',
          type: 'target',
          label: 'core.module.input.label.switch',
          valueType: 'any',
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'model',
          type: 'selectExtractModel',
          label: 'core.module.input.label.aiModel',
          required: true,
          valueType: 'string',
          value: getExtractModel().model,
          showTargetInApp: false,
          showTargetInPlugin: false,
          connected: false
        },
        {
          key: 'systemPrompt',
          type: 'textarea',
          label: 'core.module.input.label.cfr background',
          max: 300,
          value: formData.cfr.background,
          valueType: 'string',
          description: 'core.module.input.description.cfr background',
          placeholder: 'core.module.input.placeholder.cfr background',
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'history',
          type: 'numberInput',
          label: 'core.module.input.label.chat history',
          required: true,
          min: 0,
          max: 30,
          valueType: 'chatHistory',
          value: 6,
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: false
        },
        {
          key: 'userChatInput',
          type: 'target',
          label: 'core.module.input.label.user question',
          required: true,
          valueType: 'string',
          showTargetInApp: true,
          showTargetInPlugin: true,
          connected: true
        }
      ],
      outputs: [
        {
          key: 'system_text',
          label: 'core.module.output.label.cfr result',
          valueType: 'string',
          type: 'source',
          targets: [
            {
              moduleId: 'datasetSearch',
              key: 'userChatInput'
            }
          ]
        }
      ]
    }
  ];

  return modules;
}
