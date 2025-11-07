import { parseCurl } from '@fastgpt/global/common/string/http';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { i18nT } from '@fastgpt/web/i18n/utils';

export const emptyTemplates = {
  [AppTypeEnum.simple]: {
    avatar: 'core/app/type/simpleFill',
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
            valueType: WorkflowIOValueTypeEnum.object,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: {
              open: false
            }
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
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            key: 'temperature',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: undefined,
            valueType: WorkflowIOValueTypeEnum.number,
            min: 0,
            max: 10,
            step: 1
          },
          {
            key: 'maxToken',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            value: undefined,
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
          },
          {
            key: NodeInputKeyEnum.aiChatReasoning,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: '',
            valueType: WorkflowIOValueTypeEnum.boolean,
            value: true
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
    ],
    chatConfig: {}
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
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        position: {
          x: 262.2732338817093,
          y: -476.00241136598146
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
            valueType: WorkflowIOValueTypeEnum.any,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            label: 'core.app.Question Guide',
            value: {
              open: false
            }
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
          x: 632.368838596004,
          y: -347.7446492944009
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
            label: 'common:core.module.input.label.user question',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    ],
    edges: [],
    chatConfig: {}
  },
  [AppTypeEnum.workflowTool]: {
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
    edges: [],
    chatConfig: {}
  }
};

export const parsePluginFromCurlString = (
  curl: string
): {
  nodes: AppSchema['modules'];
  edges: AppSchema['edges'];
  chatConfig: AppSchema['chatConfig'];
} => {
  const { url, method, headers, body, params, bodyArray } = parseCurl(curl);

  const allInputs = Array.from(
    new Map([...params, ...bodyArray].map((item) => [item.key, item])).values()
  );
  const formatPluginStartInputs = allInputs
    .map((item) => {
      const valueType = item.value === null ? 'string' : typeof item.value;
      const valueTypeMap = {
        string: {
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.string,
          isToolType: true,
          defaultValue: item.value
        },
        number: {
          renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.number,
          isToolType: true,
          defaultValue: item.value
        },
        boolean: {
          renderTypeList: [FlowNodeInputTypeEnum.switch, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.boolean,
          isToolType: true,
          defaultValue: item.value
        },
        object: {
          renderTypeList: [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.object,
          isToolType: false,
          defaultValue: ''
        }
      };

      const valueTypeItem = valueTypeMap[valueType as keyof typeof valueTypeMap];
      if (!valueTypeItem) return;

      return {
        renderTypeList: valueTypeItem.renderTypeList,
        selectedTypeIndex: 0,
        valueType: valueTypeItem.valueType,
        canEdit: true,
        key: item.key,
        label: item.key,
        description: '',
        defaultValue: valueTypeItem.defaultValue,
        required: false,
        toolDescription: valueTypeItem.isToolType ? item.key : ''
      };
    })
    .filter(Boolean) as FlowNodeInputItemType[];
  const formatPluginStartOutputs = formatPluginStartInputs.map<FlowNodeOutputItemType>((item) => ({
    id: item.key,
    key: item.key,
    label: item.key,
    valueType: item.valueType,
    type: FlowNodeOutputTypeEnum.hidden
  }));

  const referenceHeaders = headers.map((item) => ({
    key: item.key,
    value: item.value,
    type: item.type
  }));
  const referenceParams = params.map((item) => ({
    key: item.key,
    value: `{{$pluginInput.${item.key}$}}`,
    type: item.type
  }));
  const referenceBody = Object.entries(JSON.parse(body)).reduce(
    (acc, [key, value]) => {
      acc[key] =
        typeof value === 'string' ? `###{{$pluginInput.${key}$}}###` : `{{$pluginInput.${key}$}}`;
      return acc;
    },
    {} as Record<string, any>
  );
  const referenceBodyStr = JSON.stringify(referenceBody, null, 2)
    .replace(/"{{\$/g, '{{$')
    .replace(/\$}}"/g, '$}}')
    .replace(/###{{\$/g, '{{$')
    .replace(/\$}}###/g, '$}}');

  return {
    nodes: [
      {
        nodeId: 'pluginInput',
        name: i18nT('workflow:template.plugin_start'),
        intro: i18nT('workflow:intro_plugin_input'),
        avatar: 'core/workflow/template/workflowStart',
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        showStatus: false,
        position: {
          x: 427.6554681270263,
          y: -291.6987155252725
        },
        version: '481',
        inputs: formatPluginStartInputs,
        outputs: formatPluginStartOutputs
      },
      {
        nodeId: 'pluginOutput',
        name: i18nT('common:core.module.template.self_output'),
        intro: i18nT('workflow:intro_custom_plugin_output'),
        avatar: 'core/workflow/template/pluginOutput',
        flowNodeType: FlowNodeTypeEnum.pluginOutput,
        showStatus: false,
        position: {
          x: 1870.1072210870427,
          y: -126.69871552527252
        },
        version: '481',
        inputs: [
          {
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.any,
            canEdit: true,
            key: 'result',
            label: 'result',
            isToolOutput: true,
            description: '',
            required: true,
            value: ['vumlECDQTjeC', 'httpRawResponse']
          },
          {
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.object,
            canEdit: true,
            key: 'error',
            label: 'error',
            isToolOutput: true,
            description: '',
            required: true,
            value: ['vumlECDQTjeC', 'error']
          }
        ],
        outputs: []
      },
      {
        nodeId: 'vumlECDQTjeC',
        name: 'HTTP 请求',
        intro: '可以发出一个 HTTP 请求，实现更为复杂的操作（联网搜索、数据库查询等）',
        avatar: 'core/workflow/template/httpRequest',
        flowNodeType: FlowNodeTypeEnum.httpRequest468,
        showStatus: true,
        position: {
          x: 1049.4419012643668,
          y: -471.49748139163944
        },
        version: '481',
        inputs: [
          {
            key: 'system_addInputParam',
            renderTypeList: [FlowNodeInputTypeEnum.addInputParam],
            valueType: WorkflowIOValueTypeEnum.dynamic,
            label: '',
            required: false,
            description: '接收前方节点的输出值作为变量，这些变量可以被 HTTP 请求参数使用。',
            customInputConfig: {
              selectValueTypeList: [
                WorkflowIOValueTypeEnum.string,
                WorkflowIOValueTypeEnum.number,
                WorkflowIOValueTypeEnum.boolean,
                WorkflowIOValueTypeEnum.object,
                WorkflowIOValueTypeEnum.arrayString,
                WorkflowIOValueTypeEnum.arrayNumber,
                WorkflowIOValueTypeEnum.arrayBoolean,
                WorkflowIOValueTypeEnum.arrayObject,
                WorkflowIOValueTypeEnum.arrayAny,
                WorkflowIOValueTypeEnum.any,
                WorkflowIOValueTypeEnum.chatHistory,
                WorkflowIOValueTypeEnum.datasetQuote,
                WorkflowIOValueTypeEnum.dynamic,
                WorkflowIOValueTypeEnum.selectApp,
                WorkflowIOValueTypeEnum.selectDataset
              ],
              showDescription: false,
              showDefaultValue: true
            },
            valueDesc: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpMethod',
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            valueType: WorkflowIOValueTypeEnum.string,
            label: '',
            value: method,
            required: true,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpTimeout',
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            valueType: WorkflowIOValueTypeEnum.number,
            label: '',
            value: 30,
            min: 5,
            max: 600,
            required: true,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpReqUrl',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            label: '',
            description:
              '新的 HTTP 请求地址。如果出现两个"请求地址"，可以删除该模块重新加入，会拉取最新的模块配置。',
            placeholder: 'https://api.ai.com/getInventory',
            required: false,
            value: url,
            valueDesc: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpHeader',
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            valueType: WorkflowIOValueTypeEnum.any,
            value: referenceHeaders,
            label: '',
            description:
              '自定义请求头，请严格填入 JSON 字符串。\n1. 确保最后一个属性没有逗号\n2. 确保 key 包含双引号\n例如：{"Authorization":"Bearer xxx"}',
            placeholder: 'common:core.module.input.description.Http Request Header',
            required: false,
            valueDesc: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpParams',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            value: referenceParams,
            description:
              '新的 HTTP 请求地址。如果出现两个“请求地址”，可以删除该模块重新加入，会拉取最新的模块配置。',
            label: '',
            required: false,
            valueDesc: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpJsonBody',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            value: referenceBodyStr,
            label: '',
            required: false,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpFormBody',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            value: [],
            label: '',
            required: false,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          },
          {
            key: 'system_httpContentType',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'json',
            label: '',
            required: false,
            valueDesc: '',
            description: '',
            debugLabel: '',
            toolDescription: ''
          }
        ],
        outputs: [
          {
            id: 'system_addOutputParam',
            key: 'system_addOutputParam',
            type: FlowNodeOutputTypeEnum.dynamic,
            valueType: WorkflowIOValueTypeEnum.dynamic,
            label: '输出字段提取',
            customFieldConfig: {
              selectValueTypeList: [
                WorkflowIOValueTypeEnum.string,
                WorkflowIOValueTypeEnum.number,
                WorkflowIOValueTypeEnum.boolean,
                WorkflowIOValueTypeEnum.object,
                WorkflowIOValueTypeEnum.arrayString,
                WorkflowIOValueTypeEnum.arrayNumber,
                WorkflowIOValueTypeEnum.arrayBoolean,
                WorkflowIOValueTypeEnum.arrayObject,
                WorkflowIOValueTypeEnum.arrayAny,
                WorkflowIOValueTypeEnum.any,
                WorkflowIOValueTypeEnum.chatHistory,
                WorkflowIOValueTypeEnum.datasetQuote,
                WorkflowIOValueTypeEnum.dynamic,
                WorkflowIOValueTypeEnum.selectApp,
                WorkflowIOValueTypeEnum.selectDataset
              ],
              showDescription: false,
              showDefaultValue: false
            },
            description: '可以通过 JSONPath 语法来提取响应值中的指定字段',
            valueDesc: ''
          },
          {
            id: 'error',
            key: 'error',
            label: '请求错误',
            description: 'HTTP请求错误信息，成功时返回空',
            valueType: WorkflowIOValueTypeEnum.object,
            type: FlowNodeOutputTypeEnum.static,
            valueDesc: ''
          },
          {
            id: 'httpRawResponse',
            key: 'httpRawResponse',
            required: true,
            label: '原始响应',
            description: 'HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。',
            valueType: WorkflowIOValueTypeEnum.any,
            type: FlowNodeOutputTypeEnum.static,
            valueDesc: ''
          }
        ]
      },
      {
        nodeId: 'pluginConfig',
        name: i18nT('common:core.module.template.system_config'),
        intro: '',
        avatar: 'core/workflow/template/systemConfig',
        flowNodeType: FlowNodeTypeEnum.pluginConfig,
        position: {
          x: -88.12977161770735,
          y: -235.2337531748973
        },
        version: '4811',
        inputs: [],
        outputs: []
      }
    ],
    edges: [
      {
        source: 'pluginInput',
        target: 'vumlECDQTjeC',
        sourceHandle: 'pluginInput-source-right',
        targetHandle: 'vumlECDQTjeC-target-left'
      },
      {
        source: 'vumlECDQTjeC',
        target: 'pluginOutput',
        sourceHandle: 'vumlECDQTjeC-source-right',
        targetHandle: 'pluginOutput-target-left'
      }
    ],
    chatConfig: {}
  };
};
