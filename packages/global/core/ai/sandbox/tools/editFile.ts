import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';

export const SANDBOX_EDIT_FILE_TOOL_NAME = 'sandbox_edit_file';

export const SANDBOX_EDIT_FILE_NAME: I18nStringType = {
  'zh-CN': '虚拟机/编辑文件',
  'zh-Hant': '虛擬機/編輯文件',
  en: 'Sandbox/Edit File'
};

export const SANDBOX_EDIT_FILE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_EDIT_FILE_TOOL_NAME,
    description: '在虚拟机中按原文查找并替换文件内容，支持一次编辑多个文件',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '文件路径，例如: src/index.ts 或 /home/sandbox/workspace/src/index.ts'
              },
              oldContent: {
                type: 'string',
                description: '需要被替换的原始内容'
              },
              newContent: {
                type: 'string',
                description: '替换后的新内容'
              }
            },
            required: ['path', 'oldContent', 'newContent']
          },
          description: '编辑操作列表'
        }
      },
      required: ['entries']
    }
  }
};
