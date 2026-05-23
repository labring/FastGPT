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
    description: '读取虚拟机中的文本文件内容，支持读取全文或按 1-based 行号范围读取',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径，例如: src/index.ts 或 /home/sandbox/workspace/src/index.ts'
        },
        startLine: {
          type: 'number',
          description: '起始行号，1-based，可选。不传则从文件开头读取',
          min: 1
        },
        endLine: {
          type: 'number',
          description: '结束行号，1-based，包含该行，可选。不传则读取到文件末尾',
          min: 1
        }
      },
      required: ['path']
    }
  }
};
