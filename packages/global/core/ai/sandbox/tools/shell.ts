import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';

export const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell';

export const SANDBOX_SHELL_NAME: I18nStringType = {
  'zh-CN': '虚拟机/执行命令',
  'zh-Hant': '虛擬機/執行命令',
  en: 'Sandbox/Execute Command'
};

export const SANDBOX_SHELL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_SHELL_TOOL_NAME,
    description:
      '在当前虚拟机工作目录执行 shell 命令。返回合并的标准输出和错误输出，最多保留末尾 2000 行或 50KB；长输出会保存到临时文件',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        timeout: {
          type: 'number',
          description: '超时秒数',
          max: 600,
          min: 1
        }
      },
      required: ['command']
    }
  }
};
