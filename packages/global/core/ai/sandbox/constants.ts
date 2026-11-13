import { hashStr } from '../../../common/string/tools';
import type { ChatSourceTypeEnum } from '../../chat/constants';

export const OPEN_SANDBOX_DEFAULT_ROOT_PATH = '/workspace';
export const OPEN_SANDBOX_DEFAULT_HOME_PATH = '/home/sandbox';

/** 持久化工作区根下存放运行态元数据与用户级包安装前缀（python/npm/bun）的系统隐藏目录名。 */
export const SANDBOX_INTERNAL_RUNTIME_DIR_NAME = '.fastgpt';

// ---- opensandbox-proxy 与主站共享协议常量 ----
/** `opensandbox-proxy` 回调主站内部接口（`verifyTicket` / `keepalive`）时携带的共享密钥请求头。 */
export const AGENT_SANDBOX_PROXY_SECRET_HEADER = 'x-agent-sandbox-proxy-secret';
/** 预览会话随机 ID 固定长度（`getNanoid(24)` 生成，首字符固定小写字母，后续 23 位字母数字）。 */
export const SANDBOX_PREVIEW_SESSION_ID_LENGTH = 24;
/** 预览会话随机 ID 词法校验正则，供主站签发解析与边缘代理快速预检共用。 */
export const SANDBOX_PREVIEW_SESSION_ID_REGEX = /^[a-z][a-zA-Z0-9]{23}$/;
/** `opensandbox-proxy` 单次向主站批量续期活跃沙盒的最大 ID 数量。 */
export const SANDBOX_KEEPALIVE_MAX_BATCH_SIZE = 200;

// ---- 沙盒命令执行超时边界 ----
/** `fs/exec` 单条非交互式命令未显式传入 `timeoutMs` 时的默认超时时间（30 秒）。 */
export const SANDBOX_FS_EXEC_DEFAULT_TIMEOUT_MS = 30_000;
/** `fs/exec` 单条非交互式命令允许设置的最大超时时间（10 分钟）。 */
export const SANDBOX_FS_EXEC_MAX_TIMEOUT_MS = 600_000;

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

// ---- sandboxId 生成 ----
/** 为 Sandbox 生成带 sourceType 前缀的稳定物理资源 ID。 */
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
export const SANDBOX_SYSTEM_PROMPT = `<sandbox_capability>
你拥有一个独立的 Linux 沙盒环境（Ubuntu 24.04），可通过 sandbox 工具操作文件和执行命令。
- 系统预装：bash / python3 / node / bun / git / curl
- 用户对话上传的文件存储在 ${SANDBOX_USER_FILES_PATH} 目录下
- 文件操作优先使用对应的专用工具，具体用途、参数和限制见各工具 description
- 默认将生成文件保存在当前 sandbox 工作目录；若本轮 system-reminder 指定了更具体的产物目录或禁止目录，必须优先遵守
- HTML 等多文件预览产物必须使用相对资源路径（例如 ./assets/app.js），不要使用 /assets/app.js 这类根路径
</sandbox_capability>`;
