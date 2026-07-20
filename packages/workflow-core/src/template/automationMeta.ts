import {
  formatNodeTemplateRef,
  type NodeTemplateAutomationMeta,
  type NodeTemplateRef
} from './type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const remoteModelInput = {
  defaultPolicy: 'remoteValidated',
  resourceKind: 'model'
} as const;

const automationMetaMap: Record<string, NodeTemplateAutomationMeta> = {
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
            properties: {
              key: { type: 'string' },
              valueType: { type: 'string' },
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
        bindingRequired: true
      },
      [NodeInputKeyEnum.addInputParam]: {
        configurable: false
      },
      [NodeInputKeyEnum.httpHeaders]: {
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'value'],
            properties: { key: { type: 'string' }, value: { type: 'string' } }
          }
        }
      },
      [NodeInputKeyEnum.httpParams]: {
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'value'],
            properties: { key: { type: 'string' }, value: {} }
          }
        }
      },
      [NodeInputKeyEnum.httpFormBody]: {
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'value'],
            properties: { key: { type: 'string' }, value: {} }
          }
        }
      },
      [NodeInputKeyEnum.httpJsonBody]: {
        valueSchema: { type: 'string' }
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
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['condition', 'list'],
            properties: {
              branchId: { type: 'string' },
              condition: { type: 'string', enum: ['AND', 'OR'] },
              list: { type: 'array', items: { type: 'object' } }
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
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'value'],
            properties: { key: { type: 'string' }, value: { type: 'string' } }
          }
        }
      }
    }
  },
  'builtin:user-select': {
    inputs: {
      [NodeInputKeyEnum.userSelectOptions]: {
        valueSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'value'],
            properties: { key: { type: 'string' }, value: { type: 'string' } }
          }
        }
      }
    }
  },
  'builtin:form-input': {
    inputs: {
      [NodeInputKeyEnum.userInputForms]: {
        valueSchema: { type: 'array', items: { type: 'object' } }
      }
    }
  },
  'builtin:variable-update': {
    inputs: {
      [NodeInputKeyEnum.updateList]: {
        valueSchema: { type: 'array', items: { type: 'object' } }
      }
    }
  },
  'builtin:tool-call': {
    inputs: {
      [NodeInputKeyEnum.aiModel]: remoteModelInput
    }
  },
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
  [FlowNodeTypeEnum.datasetConcatNode]: 'builtin:dataset-concat',
  [FlowNodeTypeEnum.customFeedback]: 'builtin:custom-feedback'
};

export const getAutomationMeta = (ref: NodeTemplateRef) =>
  automationMetaMap[formatNodeTemplateRef(ref)];

export const getInputAutomationMeta = (flowNodeType: string, inputKey: string) => {
  const templateRef = templateRefByFlowNodeType[flowNodeType as FlowNodeTypeEnum];
  return templateRef ? automationMetaMap[templateRef]?.inputs?.[inputKey] : undefined;
};
