import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';

export const SANDBOX_GET_FILE_URL_NAME: I18nStringType = {
  'zh-CN': '虚拟机/获取文件链接',
  'zh-Hant': '虛擬機/獲取文件鏈接',
  en: 'Sandbox/Get File URL'
};

export const SANDBOX_GET_FILE_URL_TOOL_NAME = 'sandbox_get_file_url';

export const SANDBOX_GET_FILE_URL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_GET_FILE_URL_TOOL_NAME,
    description: '为虚拟机 workspace 中的指定文件返回 2 小时有效期的直连访问链接',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: {
            type: 'string',
            description: 'workspace 文件路径，例如: output.csv'
          },
          description: 'workspace 文件路径，例如: ["output.csv", "output.txt"]'
        }
      },
      required: ['paths']
    }
  }
};
