import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';

export const SANDBOX_WRITE_FILE_TOOL_NAME = 'sandbox_write_file';

export const SANDBOX_WRITE_FILE_NAME: I18nStringType = {
  'zh-CN': '虚拟机/写入文件',
  'zh-Hant': '虛擬機/寫入文件',
  en: 'Sandbox/Write File'
};

export const SANDBOX_WRITE_FILE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_WRITE_FILE_TOOL_NAME,
    description: '在虚拟机中创建或覆盖指定文件，适合写入脚本、配置和中间数据',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径，通常为相对路径。'
        },
        content: {
          type: 'string',
          description: '写入文件的文本内容'
        }
      },
      required: ['path', 'content']
    }
  }
};
