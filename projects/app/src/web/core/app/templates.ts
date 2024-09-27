// @ts-nocheck

import { AppItemType } from '@/types/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppSchema } from '@fastgpt/global/core/app/type';
import {
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { i18nT } from '@fastgpt/web/i18n/utils';

export const emptyTemplates: Record<
  AppTypeEnum.simple | AppTypeEnum.plugin | AppTypeEnum.workflow,
  {
    name: string;
    avatar: string;
    nodes: AppSchema['modules'];
    edges: AppSchema['edges'];
    chatConfig: AppSchema['chatConfig'];
  }
> = {
  [AppTypeEnum.simple]: {
    avatar: 'core/workflow/template/aiChat',
    name: i18nT('app:template.simple_robot'),
    nodes: [
      {
        nodeId: 'userGuide',
        name: i18nT('common:core.module.template.system_config'),
        intro: i18nT('common:core.module.template.config_params'),
        avatar: 'core/workflow/template/systemConfig',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        position: {
          x: 531.2422736065552,
          y: -486.7611729549753
        },
        version: '481',
        inputs: [
          {
            key: 'welcomeText',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'core.app.Welcome Text',
            value: ''
          },
          {
            key: 'variables',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: 'core.app.Chat Variable',
            value: []
          },
          {
            key: 'questionGuide',
            valueType: WorkflowIOValueTypeEnum.boolean,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: false
          },
          {
            key: 'tts',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: {
              type: 'web'
            }
          },
          {
            key: 'whisper',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: {
              open: false,
              autoSend: false,
              autoTTSResponse: false
            }
          },
          {
            key: 'scheduleTrigger',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: null
          }
        ],
        outputs: []
      },
      {
        nodeId: '448745',
        name: i18nT('common:core.module.template.work_start'),
        intro: '',
        avatar: 'core/workflow/template/workflowStart',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        position: {
          x: 558.4082376415505,
          y: 123.72387429194112
        },
        version: '481',
        inputs: [
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: i18nT('common:core.module.input.label.user question'),
            required: true,
            toolDescription: i18nT('common:core.module.input.label.user question')
          }
        ],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            label: 'core.module.input.label.user question',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      },
      {
        nodeId: 'loOvhld2ZTKa',
        name: i18nT('common:core.module.template.ai_chat'),
        intro: i18nT('common:core.module.template.ai_chat_intro'),
        avatar: 'core/workflow/template/aiChat',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        showStatus: true,
        position: {
          x: 1097.7317280958762,
          y: -244.16014496351386
        },
        version: '481',
        inputs: [
          {
            key: 'model',
            renderTypeList: [
              FlowNodeInputTypeEnum.settingLLMModel,
              FlowNodeInputTypeEnum.reference
            ],
            label: 'core.module.input.label.aiModel',
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'gpt-4o-mini'
          },
          {
            key: 'temperature',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 0,
            valueType: WorkflowIOValueTypeEnum.number,
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: 2000,
            valueType: WorkflowIOValueTypeEnum.number,
            min: 100,
            max: 4000,
            step: 50
          },
          {
            key: 'isResponseAnswerText',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: true,
            valueType: WorkflowIOValueTypeEnum.boolean
          },
          {
            key: 'quoteTemplate',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            key: 'quotePrompt',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            key: 'systemPrompt',
            renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
            max: 3000,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'core.ai.Prompt',
            description: 'core.app.tip.systemPromptTip',
            placeholder: 'core.app.tip.chatNodeSystemPromptTip',
            value: ''
          },
          {
            key: 'history',
            renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.chatHistory,
            label: 'core.module.input.label.chat history',
            required: true,
            min: 0,
            max: 30,
            value: 6
          },
          {
            key: 'userChatInput',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
            valueType: WorkflowIOValueTypeEnum.string,
            label: i18nT('common:core.module.input.label.user question'),
            required: true,
            toolDescription: i18nT('common:core.module.input.label.user question'),
            value: ['448745', 'userChatInput']
          },
          {
            key: 'quoteQA',
            renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
            label: '',
            debugLabel: i18nT('common:core.module.Dataset quote.label'),
            description: '',
            valueType: WorkflowIOValueTypeEnum.datasetQuote
          }
        ],
        outputs: [
          {
            id: 'history',
            key: 'history',
            label: 'core.module.output.label.New context',
            description: 'core.module.output.description.New context',
            valueType: WorkflowIOValueTypeEnum.chatHistory,
            type: FlowNodeOutputTypeEnum.static
          },
          {
            id: 'answerText',
            key: 'answerText',
            label: 'core.module.output.label.Ai response content',
            description: 'core.module.output.description.Ai response content',
            valueType: WorkflowIOValueTypeEnum.string,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      }
    ],
    edges: [
      {
        source: '448745',
        target: 'loOvhld2ZTKa',
        sourceHandle: '448745-source-right',
        targetHandle: 'loOvhld2ZTKa-target-left'
      }
    ]
  },
  [AppTypeEnum.workflow]: {
    avatar: 'core/app/type/workflowFill',
    name: i18nT('common:core.module.template.empty_workflow'),
    nodes: [
      {
        nodeId: 'userGuide',
        name: i18nT('common:core.module.template.system_config'),
        intro: i18nT('common:core.module.template.system_config_info'),
        avatar: 'core/workflow/template/systemConfig',
        flowNodeType: 'userGuide',
        position: {
          x: 262.2732338817093,
          y: -476.00241136598146
        },
        version: '481',
        inputs: [
          {
            key: 'welcomeText',
            renderTypeList: ['hidden'],
            valueType: 'string',
            label: 'core.app.Welcome Text',
            value: ''
          },
          {
            key: 'variables',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: 'core.app.Chat Variable',
            value: []
          },
          {
            key: 'questionGuide',
            valueType: 'boolean',
            renderTypeList: ['hidden'],
            label: 'core.app.Question Guide',
            value: false
          },
          {
            key: 'tts',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: {
              type: 'web'
            }
          },
          {
            key: 'whisper',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: {
              open: false,
              autoSend: false,
              autoTTSResponse: false
            }
          },
          {
            key: 'scheduleTrigger',
            renderTypeList: ['hidden'],
            valueType: 'any',
            label: '',
            value: null
          }
        ],
        outputs: []
      },
      {
        nodeId: '448745',
        name: i18nT('common:core.module.template.work_start'),
        intro: '',
        avatar: 'core/workflow/template/workflowStart',
        flowNodeType: 'workflowStart',
        position: {
          x: 632.368838596004,
          y: -347.7446492944009
        },
        version: '481',
        inputs: [
          {
            key: 'userChatInput',
            renderTypeList: ['reference', 'textarea'],
            valueType: 'string',
            label: i18nT('common:core.module.input.label.user question'),
            required: true,
            toolDescription: i18nT('common:core.module.input.label.user question')
          }
        ],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            label: 'common:core.module.input.label.user question',
            type: 'static',
            valueType: 'string'
          }
        ]
      }
    ],
    edges: []
  },
  [AppTypeEnum.plugin]: {
    avatar: 'core/app/type/pluginFill',
    name: i18nT('common:core.module.template.empty_plugin'),
    nodes: [
      {
        nodeId: 'pluginInput',
        name: i18nT('workflow:template.plugin_start'),
        avatar: 'core/workflow/template/workflowStart',
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        showStatus: false,
        position: {
          x: 616.4226348688949,
          y: -165.05298493910115
        },
        version: '481',
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'pluginOutput',
        name: i18nT('common:core.module.template.self_output'),
        avatar: '/imgs/workflow/output.png',
        flowNodeType: FlowNodeTypeEnum.pluginOutput,
        showStatus: false,
        position: {
          x: 1607.7142331269126,
          y: -151.8669210746189
        },
        version: '481',
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'pluginConfig',
        name: i18nT('common:core.module.template.system_config'),
        intro: '',
        avatar: 'core/workflow/template/systemConfig',
        flowNodeType: FlowNodeTypeEnum.pluginConfig,
        position: {
          x: 184.66337662472682,
          y: -216.05298493910115
        },
        version: '4811',
        inputs: [],
        outputs: []
      }
    ],
    edges: []
  }
};
