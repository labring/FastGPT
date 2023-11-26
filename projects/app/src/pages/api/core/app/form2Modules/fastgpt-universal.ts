/* 
    universal mode.
    @author: FastGpt Team
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type.d';
import type { ModuleItemType } from '@fastgpt/global/core/module/type';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleDataTypeEnum } from '@fastgpt/global/core/module/constants';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type.d';
import { FormatForm2ModulesProps } from '@fastgpt/global/core/app/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { formData, chatModelList } = req.body as FormatForm2ModulesProps;

    const modules =
      formData.dataset.datasets.length > 0
        ? datasetTemplate(formData)
        : simpleChatTemplate(formData);

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

function chatModelInput(formData: AppSimpleEditFormType): FlowNodeInputItemType[] {
  return [
    {
      key: 'model',
      value: formData.aiSettings.model,
      type: 'custom',
      label: '对话模型',
      connected: true
    },
    {
      key: 'temperature',
      value: formData.aiSettings.temperature,
      type: 'slider',
      label: '温度',
      connected: true
    },
    {
      key: 'maxToken',
      value: formData.aiSettings.maxToken,
      type: 'custom',
      label: '回复上限',
      connected: true
    },
    {
      key: 'systemPrompt',
      value: formData.aiSettings.systemPrompt || '',
      type: 'textarea',
      label: '系统提示词',
      connected: true
    },
    {
      key: ModuleInputKeyEnum.aiChatIsResponseText,
      value: true,
      type: 'hidden',
      label: '返回AI内容',
      connected: true
    },
    {
      key: 'quoteTemplate',
      value: formData.aiSettings.quoteTemplate || '',
      type: 'hidden',
      label: '引用内容模板',
      connected: true
    },
    {
      key: 'quotePrompt',
      value: formData.aiSettings.quotePrompt || '',
      type: 'hidden',
      label: '引用内容提示词',
      connected: true
    },
    {
      key: 'switch',
      type: 'target',
      label: '触发器',
      connected: formData.dataset.datasets.length > 0 && !!formData.dataset.searchEmptyText
    },
    {
      key: 'quoteQA',
      type: 'target',
      label: '引用内容',
      connected: formData.dataset.datasets.length > 0
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
}
function simpleChatTemplate(formData: AppSimpleEditFormType): ModuleItemType[] {
  return [
    {
      name: '用户问题(对话入口)',
      flowType: FlowNodeTypeEnum.questionInput,
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
      flowType: FlowNodeTypeEnum.historyNode,
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
      flowType: FlowNodeTypeEnum.chatNode,
      inputs: chatModelInput(formData),
      showStatus: true,
      outputs: [
        {
          key: 'answerText',
          label: 'AI回复',
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
}
function datasetTemplate(formData: AppSimpleEditFormType): ModuleItemType[] {
  return [
    {
      name: '用户问题(对话入口)',
      flowType: FlowNodeTypeEnum.questionInput,
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
              moduleId: 'datasetSearch',
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
      flowType: FlowNodeTypeEnum.historyNode,
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
      flowType: FlowNodeTypeEnum.datasetSearchNode,
      showStatus: true,
      inputs: [
        {
          key: 'datasets',
          value: formData.dataset.datasets,
          type: FlowNodeInputTypeEnum.custom,
          label: '关联的知识库',
          connected: false
        },
        {
          key: 'similarity',
          value: formData.dataset.similarity,
          type: FlowNodeInputTypeEnum.slider,
          label: '相似度',
          connected: false
        },
        {
          key: 'limit',
          value: formData.dataset.limit,
          type: FlowNodeInputTypeEnum.slider,
          label: '单次搜索上限',
          connected: false
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
          key: 'rerank',
          type: FlowNodeInputTypeEnum.switch,
          label: '结果重排',
          description: '将召回的结果进行进一步重排，可增加召回率',
          plusField: true,
          connected: false,
          value: formData.dataset.rerank
        }
      ],
      outputs: [
        {
          key: 'isEmpty',
          targets: formData.dataset.searchEmptyText
            ? [
                {
                  moduleId: 'emptyText',
                  key: 'switch'
                }
              ]
            : []
        },
        {
          key: 'unEmpty',
          targets: formData.dataset.searchEmptyText
            ? [
                {
                  moduleId: 'chatModule',
                  key: 'switch'
                }
              ]
            : []
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
      moduleId: 'datasetSearch'
    },
    ...(formData.dataset.searchEmptyText
      ? [
          {
            name: '指定回复',
            flowType: FlowNodeTypeEnum.answerNode,
            inputs: [
              {
                key: ModuleInputKeyEnum.switch,
                type: FlowNodeInputTypeEnum.target,
                label: '触发器',
                connected: true
              },
              {
                key: ModuleInputKeyEnum.answerText,
                value: formData.dataset.searchEmptyText,
                type: FlowNodeInputTypeEnum.textarea,
                valueType: ModuleDataTypeEnum.string,
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
      flowType: FlowNodeTypeEnum.chatNode,
      inputs: chatModelInput(formData),
      showStatus: true,
      outputs: [
        {
          key: 'answerText',
          label: 'AI回复',
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
}
