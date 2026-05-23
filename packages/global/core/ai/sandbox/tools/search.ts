import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';

export const SANDBOX_SEARCH_TOOL_NAME = 'sandbox_search';

export const SANDBOX_SEARCH_NAME: I18nStringType = {
  'zh-CN': '虚拟机/搜索文件',
  'zh-Hant': '虛擬機/搜尋文件',
  en: 'Sandbox/Search Files'
};

export const SANDBOX_SEARCH_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_SEARCH_TOOL_NAME,
    description: '在虚拟机中按文件名或 glob 模式搜索文件路径',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '搜索模式，例如: "*.py"、"package.json"'
        },
        path: {
          type: 'string',
          description: '起始目录，可选，例如: /home/sandbox/workspace'
        }
      },
      required: ['pattern']
    }
  }
};
