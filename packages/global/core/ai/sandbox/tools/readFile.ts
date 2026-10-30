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
    description: `仅用于读取虚拟机中的 UTF-8 纯文本文件，如 txt、Markdown、JSON、CSV、代码和日志，不限于 .txt 后缀。
不要直接读取 PDF、Word、Excel、PPT、图片、音视频、压缩包等二进制文件。本工具不解析这些格式，直接读取会产生乱码或原始数据；应先使用 sandbox_shell 调用对应程序处理，需要文本内容时先提取为 UTF-8 文本再读取。
非 UTF-8 编码的文本需先转码为 UTF-8。
输出最多 2000 行或 50 KiB，可通过 offset/limit 分段读取。`,
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
