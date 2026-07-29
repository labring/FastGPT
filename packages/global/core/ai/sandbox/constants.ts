import { hashStr } from '../../../common/string/tools';
import {
  SANDBOX_EDIT_FILE_TOOL_NAME,
  SANDBOX_FIND_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SANDBOX_GREP_TOOL_NAME,
  SANDBOX_LS_TOOL_NAME,
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from './tools';
import type { SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import type { ChatSourceTypeEnum } from '../../chat/constants';

// ---- 沙盒提供方 ----
export const agentSandboxProviderList = [
  'sealosdevbox',
  'opensandbox'
] as const satisfies readonly SandboxProviderType[];

// ---- 沙盒状态 ----
export const SandboxStatusEnum = {
  running: 'running',
  stopped: 'stopped'
} as const;

/** 普通 App Chat 中 Sandbox 不可用的产品态原因。 */
export enum SandboxUnavailableReasonEnum {
  appDisabled = 'appDisabled',
  teamPlanUnavailable = 'teamPlanUnavailable',
  systemDisabled = 'systemDisabled'
}

/** Chat Test 保存本轮实际 Sandbox 开关的 metadata key。 */
export const APP_SANDBOX_ENABLED_CHAT_METADATA_KEY = 'appSandboxEnabled';
export type SandboxStatusType = (typeof SandboxStatusEnum)[keyof typeof SandboxStatusEnum];

// ---- 沙盒实例类型 ----
/** @deprecated sandbox 实例归属统一使用 sourceType/sourceId；该枚举仅用于历史数据迁移。 */
export enum SandboxTypeEnum {
  editDebug = 'edit-debug',
  sessionRuntime = 'session-runtime'
}

// ---- sandboxId 生成 ----
/** 为 v2 Sandbox 生成带 sourceType 前缀的稳定物理资源 ID。 */
export const generateSandboxId = ({
  sourceType,
  sourceId,
  userId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
}): string => `${sourceType.toLowerCase()}-${hashStr(`${sourceId}-${userId}`).slice(0, 16)}`;

// Prompt
export const SANDBOX_USER_FILES_PATH = 'user_files/';
export const SANDBOX_ENTRYPOINT_MAX_LENGTH = 16 * 1024;
export const SANDBOX_SYSTEM_PROMPT = `## 沙盒能力
你拥有一个独立的 Linux 沙盒环境（Ubuntu 22.04），可通过 sandbox 工具操作文件和执行命令。
- 系统预装：bash / python3 / node / bun / git / curl
- 用户对话上传的文件存储在 ${SANDBOX_USER_FILES_PATH} 目录下
- 使用 ${SANDBOX_SHELL_TOOL_NAME} 执行命令、运行代码和安装依赖（apt / pip / npm）
- 使用 ${SANDBOX_READ_FILE_TOOL_NAME} 读取文本文件内容，可通过 offset/limit 分段读取
- 使用 ${SANDBOX_WRITE_FILE_TOOL_NAME} 创建或覆盖文本文件
- 使用 ${SANDBOX_EDIT_FILE_TOOL_NAME} 对已有文件做精确查找替换
- 使用 ${SANDBOX_GREP_TOOL_NAME} 搜索文件内容，优先于通过 shell 调用 grep/rg
- 使用 ${SANDBOX_FIND_TOOL_NAME} 按 glob 搜索文件路径，优先于通过 shell 调用 find
- 使用 ${SANDBOX_LS_TOOL_NAME} 列出目录内容，优先于通过 shell 调用 ls
- 默认将生成文件保存在当前 sandbox 工作目录；若本轮 system-reminder 指定了更具体的产物目录或禁止目录，必须优先遵守
- HTML 等多文件预览产物必须使用相对资源路径（例如 ./assets/app.js），不要使用 /assets/app.js 这类根路径
- 若需要将生成的文件链接，可使用 ${SANDBOX_GET_FILE_URL_TOOL_NAME} 获取临时访问链接`;
