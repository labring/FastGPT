import type { I18nStringType } from '../../../common/i18n/type';
import { hashStr } from '../../../common/string/tools';
import type { ChatCompletionTool } from '../type';
import { z } from 'zod';

// ---- 沙盒状态 ----
export const SandboxStatusEnum = {
  running: 'running',
  stoped: 'stoped'
} as const;
export type SandboxStatusType = (typeof SandboxStatusEnum)[keyof typeof SandboxStatusEnum];

// ---- 暂停阈值（分钟） ----
export const SANDBOX_SUSPEND_MINUTES = 5;

// ---- sandboxId 生成 ----
export const generateSandboxId = (appId: string, userId: string, chatId: string): string => {
  return hashStr(`${appId}-${userId}-${chatId}`).slice(0, 16);
};

// Tool
export const SANDBOX_NAME: I18nStringType = {
  'zh-CN': '虚拟机',
  'zh-Hant': '虛擬機',
  en: 'Sandbox'
};
export const SANDBOX_ICON = 'core/app/sandbox/sandbox' as const;
export const SANDBOX_TOOL_NAME = 'sandbox_shell';
export const SANDBOX_TOOL_DESCRIPTION =
  '在独立 Linux 环境中执行 shell 命令，支持文件操作、代码运行、包安装等';

// ---- 系统提示词（useAgentSandbox=true 时追加） ----
export const SANDBOX_SYSTEM_PROMPT = `你拥有一个独立的 Linux 沙盒环境（Ubuntu 22.04），可通过 ${SANDBOX_TOOL_NAME} 工具执行命令：
- 预装：bash / python3 / node / bun / git / curl
- 可自行安装软件包（apt / pip / npm）
- 生成的文件内容都保存在当前目录下即可`;

export const SANDBOX_SHELL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_TOOL_NAME,
    description: SANDBOX_TOOL_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        timeout: {
          type: 'number',
          description: '超时秒数',
          max: 300,
          min: 1
        }
      },
      required: ['command']
    }
  }
};

export const SANDBOX_TOOLS: ChatCompletionTool[] = [SANDBOX_SHELL_TOOL];

// Zod Schema 用于参数验证
export const SandboxShellToolSchema = z.object({
  command: z.string(),
  timeout: z.number().optional()
});
