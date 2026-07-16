import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';

export const SANDBOX_LS_TOOL_NAME = 'sandbox_ls';

export const SANDBOX_LS_NAME: I18nStringType = {
  'zh-CN': '虚拟机/列出目录',
  'zh-Hant': '虛擬機/列出目錄',
  en: 'Sandbox/List Directory'
};

export const SANDBOX_LS_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_LS_TOOL_NAME,
    description: '列出虚拟机目录内容，目录条目以 / 结尾，并包含隐藏文件',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目标目录，可选，默认为当前目录'
        },
        limit: {
          type: 'number',
          description: '最大条目数，默认 500',
          minimum: 1,
          maximum: 5000
        }
      }
    }
  }
};
