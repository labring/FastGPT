import type { NodeTemplateAutomationMeta } from './type';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '../constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../node/constant';
import { VariableConditionEnum } from './system/ifElse/constant';
import { StoredSelectedDatasetSchema } from '../type/io';
import z from 'zod';

const remoteModelInput = {
  defaultPolicy: 'remoteValidated',
  resourceKind: 'model'
} as const;

const referenceItemSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 2,
  items: { type: 'string' }
} as const;

/** HTTP 编辑器和 cURL 导入都保存 type；旧版只保存 key/value，运行时同样支持。 */
const httpEntrySchema = {
  type: 'object',
  required: ['key', 'value'],
  properties: {
    key: { type: 'string' },
    value: {},
    type: { type: 'string' }
  }
} as const;

const inputOptionSchema = {
  type: 'object',
  required: ['key', 'value'],
  additionalProperties: false,
  properties: {
    key: { type: 'string', minLength: 1 },
    value: { type: 'string', minLength: 1 }
  }
} as const;

const dynamicFieldSchema = {
  type: 'object',
  required: ['key', 'label', 'valueType'],
  properties: {
    key: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    valueType: { type: 'string', enum: Object.values(WorkflowIOValueTypeEnum) },
    required: { type: 'boolean' },
    description: { type: 'string' },
    defaultValue: {}
  }
} as const;

const containerSystemInputs = {
  [NodeInputKeyEnum.childrenNodeIdList]: {
    configurable: false,
    agentHint: 'System-maintained child node IDs.'
  },
  [NodeInputKeyEnum.nodeWidth]: {
    configurable: false,
    agentHint: 'Web layout width; managed by the editor.'
  },
  [NodeInputKeyEnum.nodeHeight]: {
    configurable: false,
    agentHint: 'Web layout height; managed by the editor.'
  },
  [NodeInputKeyEnum.nestedNodeInputHeight]: {
    configurable: false,
    agentHint: 'Web layout input height; managed by the editor.'
  }
} satisfies NonNullable<NodeTemplateAutomationMeta['inputs']>;

const automationMetaMap: Record<string, NodeTemplateAutomationMeta> = {
  'builtin:workflow-start': {
    inputs: {
      [NodeInputKeyEnum.userChatInput]: {
        agentHint: 'Initial user question accepted by the workflow.'
      }
    }
  },
  'builtin:ai-chat': {
    inputs: {
      [NodeInputKeyEnum.aiModelId]: {
        ...remoteModelInput,
        agentHint: 'workflow:cli.input.ai_model'
      },
      systemPrompt: {
        agentHint: 'workflow:cli.input.system_prompt',
        examples: ['You are a helpful assistant.']
      },
      userChatInput: {
        agentHint: 'workflow:cli.input.user_question'
      }
    }
  },
  'builtin:text-editor': {
    inputs: {
      system_textareaInput: {
        agentHint:
          'workflow:cli.input.text_editor. This is a literal text field. Embed references using {{$nodeId.outputKey$}}; global variables use {{$VARIABLE_NODE_ID.variableKey$}}. Do not generate bare {{variableKey}} or {{nodeId.outputKey}} placeholders.',
        examples: [
          'Plain text',
          'Hello {{$VARIABLE_NODE_ID.name$}}',
          'Topic: {{$validateCode.topic$}}'
        ]
      }
    }
  },
  'builtin:assigned-answer': {
    inputs: {
      text: {
        agentHint: 'workflow:cli.input.answer',
        valueSchema: {},
        examples: ['Done']
      }
    }
  },
  'builtin:dataset-search': {
    inputs: {
      [NodeInputKeyEnum.datasetSelectList]: {
        defaultPolicy: 'remoteValidated',
        resourceKind: 'dataset',
        // 和保存链路共用持久化契约；名称、头像和向量模型只是可选快照，不能要求完整选择器对象。
        valueSchema: z.toJSONSchema(z.array(StoredSelectedDatasetSchema), { io: 'input' })
      },
      [NodeInputKeyEnum.datasetSearchRerankModelId]: remoteModelInput,
      [NodeInputKeyEnum.datasetSearchExtensionModelId]: remoteModelInput
    }
  },
  'builtin:question-optimization': {
    availableForWorkflowBuilder: false,
    inputs: {
      [NodeInputKeyEnum.aiModelId]: remoteModelInput
    }
  },
  'builtin:content-extract': {
    inputs: {
      [NodeInputKeyEnum.aiModelId]: remoteModelInput,
      [NodeInputKeyEnum.extractKeys]: {
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            // 历史字段可缺少 valueType，运行时默认按 string 提取。
            required: ['key'],
            properties: {
              key: { type: 'string', minLength: 1 },
              valueType: { type: 'string', enum: Object.values(WorkflowIOValueTypeEnum) },
              desc: { type: 'string' },
              required: { type: 'boolean' },
              defaultValue: { type: 'string' },
              // 提取节点按换行符拆分枚举，存储值不是 JSON Schema 的 enum 数组。
              enum: { type: 'string' }
            }
          }
        }
      }
    }
  },
  'builtin:http-request': {
    inputs: {
      [NodeInputKeyEnum.httpReqUrl]: {
        defaultPolicy: 'userRequired',
        bindingRequired: true,
        configurable: true,
        inputModes: ['literal'],
        agentHint:
          'Absolute HTTP or HTTPS request URL, optionally assembled with {{$nodeId.outputKey$}} references. A URL stored in a global variable uses {{$VARIABLE_NODE_ID.variableKey$}}; never use bare {{variableKey}} placeholders.'
      },
      [NodeInputKeyEnum.addInputParam]: {
        configurable: false
      },
      [NodeInputKeyEnum.httpHeaders]: {
        agentHint: 'HTTP headers as key/value entries.',
        valueSchema: {
          type: 'array',
          items: {
            ...httpEntrySchema,
            properties: { ...httpEntrySchema.properties, value: { type: 'string' } }
          }
        }
      },
      [NodeInputKeyEnum.httpParams]: {
        configurable: true,
        inputModes: ['literal'],
        agentHint: 'URL query parameters as key/value entries.',
        valueSchema: {
          type: 'array',
          items: httpEntrySchema
        }
      },
      [NodeInputKeyEnum.httpFormBody]: {
        configurable: true,
        inputModes: ['literal'],
        agentHint: 'Form body fields as key/value entries.',
        valueSchema: {
          type: 'array',
          items: httpEntrySchema
        }
      },
      [NodeInputKeyEnum.httpJsonBody]: {
        configurable: true,
        inputModes: ['literal'],
        agentHint: 'JSON request body serialized as a string.',
        valueSchema: { type: 'string' }
      },
      [NodeInputKeyEnum.httpContentType]: {
        configurable: true,
        inputModes: ['literal'],
        agentHint: 'HTTP request body content type.'
      },
      [NodeInputKeyEnum.headerSecret]: {
        configurable: false,
        defaultPolicy: 'userRequired',
        resourceKind: 'secret'
      }
    }
  },
  'builtin:code': {
    inputs: {
      [NodeInputKeyEnum.addInputParam]: {
        configurable: false
      },
      [NodeInputKeyEnum.codeType]: {
        agentHint: 'Code language identifier supported by the sandbox.'
      },
      [NodeInputKeyEnum.code]: {
        agentHint:
          'Complete sandbox function source. Parameters define dynamic inputs and returned object keys define outputs.'
      }
    }
  },
  'builtin:call-app': {
    inputs: {
      [NodeInputKeyEnum.runAppSelectApp]: {
        defaultPolicy: 'remoteValidated',
        resourceKind: 'app',
        valueSchema: {
          type: 'object',
          required: ['appId'],
          properties: { appId: { type: 'string' } }
        }
      }
    }
  },
  'builtin:if-else': {
    inputs: {
      [NodeInputKeyEnum.ifElseList]: {
        configurable: true,
        inputModes: ['literal'],
        agentHint:
          'Ordered conditional branches. Configure branches before connecting branch edges.',
        valueSchema: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['condition', 'list'],
            additionalProperties: false,
            properties: {
              branchId: { type: 'string', minLength: 1 },
              condition: { type: 'string', enum: ['AND', 'OR'] },
              list: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    variable: referenceItemSchema,
                    condition: {
                      type: 'string',
                      enum: Object.values(VariableConditionEnum)
                    },
                    value: {
                      anyOf: [{ type: 'string' }, referenceItemSchema]
                    },
                    valueType: { type: 'string', enum: ['input', 'reference'] }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  'builtin:question-classification': {
    inputs: {
      [NodeInputKeyEnum.aiModelId]: remoteModelInput,
      [NodeInputKeyEnum.agents]: {
        agentHint: 'Classification branches. Each key is also the execution branch key.',
        valueSchema: {
          type: 'array',
          minItems: 1,
          items: inputOptionSchema
        }
      }
    }
  },
  'builtin:user-select': {
    inputs: {
      [NodeInputKeyEnum.userSelectOptions]: {
        agentHint: 'User choices. Each key is also the execution branch key.',
        valueSchema: {
          type: 'array',
          minItems: 1,
          items: inputOptionSchema
        }
      }
    }
  },
  'builtin:form-input': {
    inputs: {
      [NodeInputKeyEnum.userInputForms]: {
        agentHint: 'Form fields. Field keys become dynamic node output keys.',
        valueSchema: {
          type: 'array',
          minItems: 1,
          items: {
            ...dynamicFieldSchema,
            // value 是交互时的填写值，未填写时不会随 JSON 保存；不能作为表单定义必填项。
            required: ['type', 'key', 'label', 'valueType', 'required'],
            properties: {
              ...dynamicFieldSchema.properties,
              type: { type: 'string', enum: Object.values(FlowNodeInputTypeEnum) },
              value: {},
              maxLength: { type: 'number' },
              minLength: { type: 'number' },
              max: { type: 'number' },
              min: { type: 'number' },
              list: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['label', 'value'],
                  additionalProperties: false,
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  'builtin:variable-update': {
    inputs: {
      [NodeInputKeyEnum.updateList]: {
        configurable: true,
        inputModes: ['literal'],
        agentHint:
          'Variable updates. renderType determines whether value is literal or a node reference.',
        valueSchema: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['renderType'],
            additionalProperties: false,
            properties: {
              variable: referenceItemSchema,
              value: {
                // 手动值保存为 ['', value]，第二项可为任意 JSON 值；引用仍使用字符串二元组。
                anyOf: [
                  referenceItemSchema,
                  { type: 'array', items: referenceItemSchema },
                  {
                    type: 'array',
                    minItems: 2,
                    maxItems: 2,
                    prefixItems: [{ const: '' }, {}],
                    items: false
                  }
                ]
              },
              valueType: { type: 'string', enum: Object.values(WorkflowIOValueTypeEnum) },
              renderType: {
                type: 'string',
                enum: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
              },
              numberOperator: { type: 'string', enum: ['+', '-', '*', '/', '='] },
              booleanMode: { type: 'string', enum: ['true', 'false', 'negate'] },
              arrayMode: { type: 'string', enum: ['append', 'clear', 'equal'] }
            }
          }
        }
      }
    }
  },
  'builtin:tool-call': {
    inputs: {
      [NodeInputKeyEnum.aiModelId]: remoteModelInput
    }
  },
  'builtin:read-files': {
    inputs: {
      [NodeInputKeyEnum.fileUrlList]: {
        agentHint: 'Reference an upstream Array<string> containing file URLs.'
      }
    }
  },
  'builtin:parallel-run': {
    inputs: {
      [NodeInputKeyEnum.nestedInputArray]: {
        agentHint: 'Reference the array processed concurrently by child nodes.'
      },
      ...containerSystemInputs
    }
  },
  'builtin:loop-run': {
    inputs: {
      [NodeInputKeyEnum.loopRunInputArray]: {
        agentHint: 'Reference the array iterated by child nodes.'
      },
      [NodeInputKeyEnum.loopCustomOutputs]: {
        configurable: false,
        agentHint: 'Dynamic output marker. Use output add/remove commands instead of input set.'
      },
      ...containerSystemInputs
    }
  },
  'builtin:loop-run-break': { inputs: {} },
  'builtin:dataset-concat': {
    inputs: {
      [NodeInputKeyEnum.datasetQuoteList]: {
        configurable: false,
        agentHint: 'workflow:cli.input.dataset_quotes'
      }
    }
  },
  'builtin:custom-feedback': {
    inputs: {
      [NodeInputKeyEnum.textareaInput]: {
        agentHint: 'workflow:cli.input.custom_feedback'
      }
    }
  }
};

/** Builder 已发布的系统模板标识和展示顺序；内部模板也在此登记以统一解析入口。 */
export const workflowBuilderTemplateIds: Partial<Record<FlowNodeTypeEnum, string>> = {
  [FlowNodeTypeEnum.workflowStart]: 'builtin:workflow-start',
  [FlowNodeTypeEnum.chatNode]: 'builtin:ai-chat',
  [FlowNodeTypeEnum.textEditor]: 'builtin:text-editor',
  [FlowNodeTypeEnum.answerNode]: 'builtin:assigned-answer',
  [FlowNodeTypeEnum.datasetSearchNode]: 'builtin:dataset-search',
  [FlowNodeTypeEnum.queryExtension]: 'builtin:question-optimization',
  [FlowNodeTypeEnum.contentExtract]: 'builtin:content-extract',
  [FlowNodeTypeEnum.httpRequest468]: 'builtin:http-request',
  [FlowNodeTypeEnum.code]: 'builtin:code',
  [FlowNodeTypeEnum.runApp]: 'builtin:call-app',
  [FlowNodeTypeEnum.ifElseNode]: 'builtin:if-else',
  [FlowNodeTypeEnum.classifyQuestion]: 'builtin:question-classification',
  [FlowNodeTypeEnum.userSelect]: 'builtin:user-select',
  [FlowNodeTypeEnum.formInput]: 'builtin:form-input',
  [FlowNodeTypeEnum.toolCall]: 'builtin:tool-call',
  [FlowNodeTypeEnum.readFiles]: 'builtin:read-files',
  [FlowNodeTypeEnum.variableUpdate]: 'builtin:variable-update',
  [FlowNodeTypeEnum.parallelRun]: 'builtin:parallel-run',
  [FlowNodeTypeEnum.loopRun]: 'builtin:loop-run',
  [FlowNodeTypeEnum.loopRunBreak]: 'builtin:loop-run-break',
  [FlowNodeTypeEnum.datasetConcatNode]: 'builtin:dataset-concat',
  [FlowNodeTypeEnum.customFeedback]: 'builtin:custom-feedback',
  [FlowNodeTypeEnum.nestedStart]: 'builtin:__nested-start',
  [FlowNodeTypeEnum.nestedEnd]: 'builtin:__nested-end',
  [FlowNodeTypeEnum.loopRunStart]: 'builtin:__loop-run-start'
};

/** 按稳定模板标识读取 Builder 自动化策略；无元数据的内部模板沿用原始契约。 */
export const getAutomationMeta = (templateId: string) => automationMetaMap[templateId];

/** 根据节点运行类型读取内置模板元数据；历史或外部类型没有映射时不施加额外限制。 */
export const getNodeAutomationMeta = (flowNodeType: string) => {
  const templateRef = workflowBuilderTemplateIds[flowNodeType as FlowNodeTypeEnum];
  return templateRef ? automationMetaMap[templateRef] : undefined;
};

/** 读取节点输入的自动化契约，供引用校验和外部资源识别复用。 */
export const getInputAutomationMeta = (flowNodeType: string, inputKey: string) =>
  getNodeAutomationMeta(flowNodeType)?.inputs?.[inputKey];
