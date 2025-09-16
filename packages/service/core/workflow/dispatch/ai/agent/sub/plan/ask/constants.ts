import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../../constants';

export type AskAgentToolParamsType = Partial<{
  mode: 'select' | 'formInput' | 'input';
  prompt: string;
  options: string[];
  form: {
    field: string;
    type: 'textInput' | 'numberInput' | 'singleSelect' | 'multiSelect';
    required: boolean;
    options: string[];
  }[];
}>;

export const AskAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.ask,
    description: `
调用此工具时，LLM 可以向用户发起一次交互式问题。
参数结构非常简洁，仅包含 mode、prompt、options 三个字段，但通过不同的组合方式可以覆盖两种主要交互场景：
1. mode = "select"
    - 用于枚举型选择（如调查问卷、多项选择、分支逻辑）。
    - prompt: 展示在问题顶部的主要提问文案。
    - options: 字符串数组，表示可供选择的选项。前端渲染时可以将每个选项显示为卡片、列表项或按钮。
    - 场景示例：
      * 让用户在几个备选方案中选择最贴近的情况。
      * 希望结果结构化，便于后续逻辑分支。
2. mode = "input"
    - 用于自由文本输入，适合用户提供个性化或开放式回答。
    - prompt: 展示的问题提示，引导用户填写。
    - options: 此模式下通常留空或忽略。
    - 场景示例：
      * 需要用户补充说明原因、填写备注、输入 URL/编号等。
      * 当 "select" 的选项无法覆盖用户真实答案时，可以再调用一次 "input" 追问。

使用建议：
- 优先使用 "select" 以获得结构化结果，减少歧义。
- 当问题答案无法预先枚举，或需要用户自由表达时，使用 "input"。
- 如果需要“Something else”选项，可以把它放进 options 里作为一个普通选项，然后再根据用户选择调用一次 "input" 让用户详细描述。
    `,
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['select', 'input'],
          description: '交互模式'
        },
        prompt: {
          type: 'string',
          description: '向用户展示的提示信息'
        },
        options: {
          type: 'array',
          description: '当 mode=select 时可供选择的选项',
          items: {
            type: 'string'
          }
        }
        // form: {
        //   type: 'array',
        //   description: '当 mode=formInput 时需要填写的表单字段列表',
        //   items: {
        //     type: 'object',
        //     properties: {
        //       field: {
        //         type: 'string',
        //         description: '字段名，如 name, age, 同时会展示给用户一样的label'
        //       },
        //       type: {
        //         type: 'string',
        //         enum: ['textInput', 'numberInput', 'singleSelect', 'multiSelect'],
        //         description: '字段输入类型'
        //       },
        //       required: { type: 'boolean', description: '该字段是否必填', default: false },
        //       options: {
        //         type: 'array',
        //         description: '当 type 为 singleSelect 或 multiSelect 时的可选项',
        //         items: { type: 'string' }
        //       }
        //     },
        //     required: ['field', 'type']
        //   }
        // },
      },
      required: ['mode', 'prompt']
    }
  }
};
