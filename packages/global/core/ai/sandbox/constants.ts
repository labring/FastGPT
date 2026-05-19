import { hashStr } from '../../../common/string/tools';
import {
  SANDBOX_EDIT_FILE_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SEARCH_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from './tools';

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

// Prompt
export const SANDBOX_USER_FILES_PATH = 'user_files/';
export const SANDBOX_SYSTEM_PROMPT = `## 沙盒能力
你拥有一个独立的 Linux 沙盒环境（Ubuntu 22.04），可通过 sandbox 工具操作文件和执行命令。
- 系统预装：bash / python3 / node / bun / git / curl
- 用户对话上传的文件存储在 ${SANDBOX_USER_FILES_PATH} 目录下
- 使用 ${SANDBOX_SHELL_TOOL_NAME} 执行命令、运行代码和安装依赖（apt / pip / npm）
- 使用 ${SANDBOX_READ_FILE_TOOL_NAME} 读取文本文件内容，可读取全文或指定行号范围
- 使用 ${SANDBOX_WRITE_FILE_TOOL_NAME} 创建或覆盖文本文件
- 使用 ${SANDBOX_EDIT_FILE_TOOL_NAME} 对已有文件做精确查找替换
- 使用 ${SANDBOX_SEARCH_TOOL_NAME} 搜索沙盒内的文件路径
- 生成的文件内容保存在当前工作区即可
- 若需要将生成的文件链接，可使用 ${SANDBOX_GET_FILE_URL_TOOL_NAME} 获取临时访问链接`;
