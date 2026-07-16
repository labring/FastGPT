import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';

export const SANDBOX_GREP_TOOL_NAME = 'sandbox_grep';

export const SANDBOX_GREP_NAME: I18nStringType = {
  'zh-CN': '虚拟机/搜索内容',
  'zh-Hant': '虛擬機/搜尋內容',
  en: 'Sandbox/Grep'
};

export const SANDBOX_GREP_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_GREP_TOOL_NAME,
    description: '搜索虚拟机中的文件内容，返回匹配文件、行号和文本，并遵循 .gitignore',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '正则表达式或文本搜索模式'
        },
        path: {
          type: 'string',
          description: '搜索目录或文件，可选，默认为当前目录'
        },
        glob: {
          type: 'string',
          description: '文件 glob 过滤条件，可选，例如: *.ts 或 **/*.spec.ts'
        },
        ignoreCase: {
          type: 'boolean',
          description: '是否忽略大小写，默认 false'
        },
        literal: {
          type: 'boolean',
          description: '是否把 pattern 当作普通文本而不是正则表达式，默认 false'
        },
        context: {
          type: 'number',
          description: '每个匹配前后返回的上下文行数，默认 0',
          minimum: 0
        },
        limit: {
          type: 'number',
          description: '最大匹配数，默认 100',
          minimum: 1,
          maximum: 1000
        }
      },
      required: ['pattern']
    }
  }
};
