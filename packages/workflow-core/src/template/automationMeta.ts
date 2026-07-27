import {
  formatNodeTemplateRef,
  type NodeTemplateAutomationMeta,
  type NodeTemplateRef
} from './type';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';

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
      [NodeInputKeyEnum.aiModel]: {
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
        agentHint: 'workflow:cli.input.text_editor',
        examples: ['Hello {{name}}']
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
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['datasetId', 'name', 'avatar', 'vectorModel'],
            properties: {
              datasetId: { type: 'string' },
              name: { type: 'string' },
              avatar: { type: 'string' },
              vectorModel: {
                type: 'object',
                required: ['model'],
                properties: { model: { type: 'string' } }
              }
            }
          }
        }
      },
      [NodeInputKeyEnum.datasetSearchRerankModel]: remoteModelInput,
      [NodeInputKeyEnum.datasetSearchExtensionModel]: remoteModelInput
    }
  },
  'builtin:question-optimization': {
    inputs: {
      [NodeInputKeyEnum.aiModel]: remoteModelInput
    }
  },
  'builtin:content-extract': {
    inputs: {
      [NodeInputKeyEnum.aiModel]: remoteModelInput,
      [NodeInputKeyEnum.extractKeys]: {
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'valueType'],
            additionalProperties: false,
            properties: {
              key: { type: 'string', minLength: 1 },
              valueType: { type: 'string', enum: Object.values(WorkflowIOValueTypeEnum) },
              description: { type: 'string' },
              required: { type: 'boolean' },
              enum: { type: 'array', items: { type: 'string' } }
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
        agentHint: 'Absolute HTTP or HTTPS request URL.'
      },
      [NodeInputKeyEnum.addInputParam]: {
        configurable: false
      },
      [NodeInputKeyEnum.httpHeaders]: {
        agentHint: 'HTTP headers as key/value entries.',
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'value'],
            additionalProperties: false,
            properties: { key: { type: 'string' }, value: { type: 'string' } }
          }
        }
      },
      [NodeInputKeyEnum.httpParams]: {
        configurable: true,
        inputModes: ['literal'],
        agentHint: 'URL query parameters as key/value entries.',
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'value'],
            additionalProperties: false,
            properties: { key: { type: 'string' }, value: {} }
          }
        }
      },
      [NodeInputKeyEnum.httpFormBody]: {
        configurable: true,
        inputModes: ['literal'],
        agentHint: 'Form body fields as key/value entries.',
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'value'],
            additionalProperties: false,
            properties: { key: { type: 'string' }, value: {} }
          }
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
      [NodeInputKeyEnum.aiModel]: remoteModelInput,
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
            required: ['type', 'key', 'label', 'value', 'valueType', 'required'],
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
                anyOf: [referenceItemSchema, { type: 'array', items: referenceItemSchema }]
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
      [NodeInputKeyEnum.aiModel]: remoteModelInput
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

const templateRefByFlowNodeType: Partial<Record<FlowNodeTypeEnum, string>> = {
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
  [FlowNodeTypeEnum.variableUpdate]: 'builtin:variable-update',
  [FlowNodeTypeEnum.toolCall]: 'builtin:tool-call',
  [FlowNodeTypeEnum.readFiles]: 'builtin:read-files',
  [FlowNodeTypeEnum.parallelRun]: 'builtin:parallel-run',
  [FlowNodeTypeEnum.loopRun]: 'builtin:loop-run',
  [FlowNodeTypeEnum.loopRunBreak]: 'builtin:loop-run-break',
  [FlowNodeTypeEnum.datasetConcatNode]: 'builtin:dataset-concat',
  [FlowNodeTypeEnum.customFeedback]: 'builtin:custom-feedback'
};

export const getAutomationMeta = (ref: NodeTemplateRef) =>
  automationMetaMap[formatNodeTemplateRef(ref)];

export const getInputAutomationMeta = (flowNodeType: string, inputKey: string) => {
  const templateRef = templateRefByFlowNodeType[flowNodeType as FlowNodeTypeEnum];
  return templateRef ? automationMetaMap[templateRef]?.inputs?.[inputKey] : undefined;
};
