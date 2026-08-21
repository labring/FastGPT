import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';

export const SANDBOX_FIND_TOOL_NAME = 'sandbox_find';

export const SANDBOX_FIND_NAME: I18nStringType = {
  'zh-CN': '虚拟机/查找文件',
  'zh-Hant': '虛擬機/查找檔案',
  en: 'Sandbox/Find'
};

export const SANDBOX_FIND_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_FIND_TOOL_NAME,
    description: '按 glob 模式查找虚拟机中的文件路径，并遵循 .gitignore',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '文件 glob 模式，例如: *.ts、**/*.json 或 src/**/*.spec.ts'
        },
        path: {
          type: 'string',
          description: '搜索目录，可选，默认为当前目录'
        },
        limit: {
          type: 'number',
          description: '最大结果数，默认 1000',
          minimum: 1,
          maximum: 5000
        }
      },
      required: ['pattern']
    }
  }
};
