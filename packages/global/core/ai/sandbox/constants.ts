import { hashStr } from '../../../common/string/tools';
import {
  SANDBOX_EDIT_FILE_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SEARCH_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from './tools';
import type { SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';

// ---- 沙盒提供方 ----
export const agentSandboxProviderList = [
  'sealosdevbox',
  'opensandbox',
  'e2b'
] as const satisfies readonly SandboxProviderType[];

// ---- 沙盒状态 ----
export const SandboxStatusEnum = {
  running: 'running',
  stopped: 'stopped'
} as const;
export type SandboxStatusType = (typeof SandboxStatusEnum)[keyof typeof SandboxStatusEnum];

// ---- 沙盒实例类型 ----
/** @deprecated sandbox 实例归属统一使用 sourceType/sourceId；该枚举仅用于历史数据迁移。 */
export enum SandboxTypeEnum {
  editDebug = 'edit-debug',
  sessionRuntime = 'session-runtime'
}

// ---- 暂停阈值（分钟） ----
export const SANDBOX_SUSPEND_MINUTES = 10;

// ---- sandboxId 生成 ----
export const generateSandboxId = (appId: string, userId: string, chatId: string): string => {
  return hashStr(`${String(appId)}-${String(userId)}-${String(chatId)}`).slice(0, 16);
};

// Prompt
export const SANDBOX_USER_FILES_PATH = 'user_files/';
export const SANDBOX_ENTRYPOINT_MAX_LENGTH = 16 * 1024;

const buildSandboxSystemPrompt = (includeUserFilesPrompt: boolean) => `## 沙盒能力
你拥有一个独立的 Linux 沙盒环境（Ubuntu 22.04），可通过 sandbox 工具操作文件和执行命令。
- 系统预装：bash / python3 / node / bun / git / curl
${
  includeUserFilesPrompt ? `- 用户对话上传的文件存储在 ${SANDBOX_USER_FILES_PATH} 目录下\n` : ''
}- 使用 ${SANDBOX_SHELL_TOOL_NAME} 执行命令、运行代码和安装依赖（apt / pip / npm）
- 使用 ${SANDBOX_READ_FILE_TOOL_NAME} 读取文本文件内容，可读取全文或指定行号范围
- 使用 ${SANDBOX_WRITE_FILE_TOOL_NAME} 创建或覆盖文本文件
- 使用 ${SANDBOX_EDIT_FILE_TOOL_NAME} 对已有文件做精确查找替换
- 使用 ${SANDBOX_SEARCH_TOOL_NAME} 搜索沙盒内的文件路径
- 默认将生成文件保存在当前 sandbox 工作目录；若本轮 system-reminder 指定了更具体的产物目录或禁止目录，必须优先遵守
- 若需要将生成的文件链接，可使用 ${SANDBOX_GET_FILE_URL_TOOL_NAME} 获取临时访问链接`;

export const SANDBOX_SYSTEM_PROMPT = buildSandboxSystemPrompt(true);

/** Skill Detail 不注入对话附件，因此不声明附件目录。 */
export const SKILL_EDIT_SANDBOX_SYSTEM_PROMPT = buildSandboxSystemPrompt(false);
