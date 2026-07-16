import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';

export const SANDBOX_READ_FILE_TOOL_NAME = 'sandbox_read_file';

export const SANDBOX_READ_FILE_NAME: I18nStringType = {
  'zh-CN': '虚拟机/读取文件',
  'zh-Hant': '虛擬機/讀取文件',
  en: 'Sandbox/Read File'
};

export const SANDBOX_READ_FILE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_READ_FILE_TOOL_NAME,
    description:
      '读取虚拟机中的文本文件内容。输出最多 2000 行或 50KB，可通过 offset/limit 分段读取',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径，例如: src/index.ts 或 /home/sandbox/workspace/src/index.ts'
        },
        offset: {
          type: 'number',
          description: '起始行号，1-based，可选。不传则从文件开头读取',
          minimum: 1
        },
        limit: {
          type: 'number',
          description: '最大读取行数，可选。不传则读取到文件末尾或输出上限',
          minimum: 1
        }
      },
      required: ['path']
    }
  }
};
