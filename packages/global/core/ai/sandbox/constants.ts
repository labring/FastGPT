import type { I18nStringType } from '../../../common/i18n/type';
import { hashStr } from '../../../common/string/tools';
import type { ChatCompletionTool } from '../llm/type';
import z from 'zod';

// ---- 沙盒状态 ----
export const SandboxStatusEnum = {
  running: 'running',
  stopped: 'stopped'
} as const;
export type SandboxStatusType = (typeof SandboxStatusEnum)[keyof typeof SandboxStatusEnum];

// ---- 暂停阈值（分钟） ----
export const SANDBOX_SUSPEND_MINUTES = 5;

// ---- sandboxId 生成 ----
export const generateSandboxId = (appId: string, userId: string, chatId: string): string => {
  return hashStr(`${String(appId)}-${String(userId)}-${String(chatId)}`).slice(0, 16);
};

// Shell Tool
export const SANDBOX_NAME: I18nStringType = {
  'zh-CN': '虚拟机',
  'zh-Hant': '虛擬機',
  en: 'Sandbox'
};
export const SANDBOX_ICON = 'core/app/sandbox/sandbox' as const;
export const SANDBOX_TOOL_NAME = 'sandbox_shell';
export const SANDBOX_SHELL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_TOOL_NAME,
    description: '在独立 Linux 虚拟机环境中执行 shell 命令，支持文件操作、代码运行、包安装等',
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

// Get File URL Tool
export const SANDBOX_READ_FILE_TOOL_NAME: I18nStringType = {
  'zh-CN': '虚拟机/获取文件链接',
  'zh-Hant': '虛擬機/獲取文件鏈接',
  en: 'Sandbox/Get File URL'
};
export const SANDBOX_GET_FILE_URL_TOOL_NAME = 'sandbox_get_file_url';
export const SANDBOX_GET_FILE_URL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_GET_FILE_URL_TOOL_NAME,
    description: '从虚拟机读取指定文件，上传至云存储，返回 2 小时有效期的访问链接',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: {
            type: 'string',
            description: '文件访问路径，例如: output.csv'
          },
          description: '文件访问路径，例如: ["output.csv", "output.txt"]'
        }
      },
      required: ['paths']
    }
  }
};

// Prompt
export const SANDBOX_USER_FILES_PATH = 'user_files/';
export const SANDBOX_SYSTEM_PROMPT = `## 沙盒能力
你拥有一个独立的 Linux 沙盒环境（Ubuntu 22.04），可通过 ${SANDBOX_TOOL_NAME} 工具执行命令。
- 系统预装：bash / python3 / node / bun / git / curl
- 可自行安装软件包（apt / pip / npm）
- 生成的文件内容都保存在当前目录下即可
- 用户主动上传的文件存储在 ${SANDBOX_USER_FILES_PATH} 目录下
- 若需要将生成的文件链接，可使用 ${SANDBOX_GET_FILE_URL_TOOL_NAME} 工具获取文件的临时访问链接`;

// 聚合
export const sandboxToolMap: Record<
  string,
  { schema: ChatCompletionTool; name: I18nStringType; avatar: string; toolDescription: string }
> = {
  [SANDBOX_TOOL_NAME]: {
    schema: SANDBOX_SHELL_TOOL,
    name: SANDBOX_NAME,
    avatar: SANDBOX_ICON,
    toolDescription: SANDBOX_SHELL_TOOL.function.description!
  },
  [SANDBOX_GET_FILE_URL_TOOL_NAME]: {
    schema: SANDBOX_GET_FILE_URL_TOOL,
    name: SANDBOX_READ_FILE_TOOL_NAME,
    avatar: SANDBOX_ICON,
    toolDescription: SANDBOX_GET_FILE_URL_TOOL.function.description!
  }
};

export const SANDBOX_TOOLS = Object.values(sandboxToolMap).map((item) => item.schema);
