import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../constants';

export const AskAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.ask,
    description: '调用此工具，向用户发起交互式提问',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['userSelect', 'formInput', 'userInput'],
          description: '交互模式'
        },
        prompt: {
          type: 'string',
          description: '向用户展示的提示信息'
        },
        options: {
          type: 'array',
          description: '当 mode=userSelect 时可供选择的选项',
          items: {
            type: 'string'
          }
        },
        form: {
          type: 'array',
          description: '当 mode=formInput 时需要填写的表单字段列表',
          items: {
            type: 'object',
            properties: {
              field: {
                type: 'string',
                description: '字段名，如 name, age, 同时会展示给用户一样的label'
              },
              type: {
                type: 'string',
                enum: ['textInput', 'numberInput', 'singleSelect', 'multiSelect'],
                description: '字段输入类型'
              },
              required: { type: 'boolean', description: '该字段是否必填', default: false },
              options: {
                type: 'array',
                description: '当 type 为 singleSelect 或 multiSelect 时的可选项',
                items: { type: 'string' }
              }
            },
            required: ['field', 'type']
          }
        },
        userInput: {
          type: 'string',
          description: '当 mode=userInput 时用户自由输入的内容'
        }
      },
      required: ['mode', 'prompt']
    }
  }
};
