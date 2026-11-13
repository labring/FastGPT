import { isHttpUrl } from '@fastgpt/global/common/string/url';
import z from 'zod';
import type { StorageDownloadUrlMode } from './common/s3/contracts/type';
import type { StorageVendorSchema } from './env.const';

const TEST_INVOKE_TOKEN_SECRET = 'fastgpt_test_invoke_token_secret_32';
const TEST_PRO_TOKEN = 'fastgpt_test_pro_token_32_chars_min';
/**
 * 测试套件会在多个 workspace（包含 pro/admin 子模块）里直接导入 serviceEnv。
 * AI Proxy 和 INVOKE_TOKEN_SECRET 生产启动仍要求显式配置；PRO_TOKEN 仅在启用 Pro 内部调用时配置。
 * 仅 Vitest/测试环境允许注入稳定测试密钥，避免每个测试项目都重复维护同一组运行时密钥。
 * 品牌标识在开源版始终开启；接入 Pro 服务后由 SHOW_OUTLINK_BRAND 显式启用。
 */
export const getRuntimeEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  SHOW_OUTLINK_BRAND: process.env.PRO_URL ? process.env.SHOW_OUTLINK_BRAND : 'true',
  AIPROXY_API_ENDPOINT:
    process.env.AIPROXY_API_ENDPOINT ??
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
      ? 'http://127.0.0.1:3000'
      : undefined),
  AIPROXY_API_TOKEN:
    process.env.AIPROXY_API_TOKEN ??
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
      ? 'test-aiproxy-token'
      : undefined),
  INVOKE_TOKEN_SECRET:
    process.env.INVOKE_TOKEN_SECRET ??
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
      ? TEST_INVOKE_TOKEN_SECRET
      : undefined),
  PRO_TOKEN:
    process.env.PRO_TOKEN ??
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' ? TEST_PRO_TOKEN : undefined)
});

/* ===== S3 ===== */
type S3Env = {
  STORAGE_VENDOR: z.infer<typeof StorageVendorSchema>;
  STORAGE_DOWNLOAD_URL_MODE: StorageDownloadUrlMode;
  STORAGE_EXTERNAL_ENDPOINT?: string;
  STORAGE_R2_PUBLIC_ENDPOINT?: string;
  STORAGE_S3_CDN_ENDPOINT?: string;
};

/**
 * 校验对象存储下载模式依赖的公网访问地址。
 * CDN 仅用于替换已生成的外部 URL，因此必须同时配置外部地址。
 * 除此之外，仅 MinIO 的 short-redirect 模式需要显式提供客户端可访问的外部地址。
 */
export const validateS3Env = (env: S3Env): void => {
  if (env.STORAGE_S3_CDN_ENDPOINT && !env.STORAGE_EXTERNAL_ENDPOINT) {
    throw new Error(
      'Invalid S3 environment variables: STORAGE_EXTERNAL_ENDPOINT is required when STORAGE_S3_CDN_ENDPOINT is configured.'
    );
  }

  if (env.STORAGE_VENDOR === 'r2' && env.STORAGE_S3_CDN_ENDPOINT) {
    throw new Error(
      'Invalid S3 environment variables: STORAGE_S3_CDN_ENDPOINT is not supported when STORAGE_VENDOR is r2.'
    );
  }

  if (env.STORAGE_VENDOR === 'r2' && !env.STORAGE_R2_PUBLIC_ENDPOINT) {
    throw new Error(
      'Invalid S3 environment variables: STORAGE_R2_PUBLIC_ENDPOINT is required when STORAGE_VENDOR is r2.'
    );
  }

  const requiresExternalEndpoint =
    env.STORAGE_VENDOR === 'minio' && env.STORAGE_DOWNLOAD_URL_MODE === 'short-redirect';

  if (!requiresExternalEndpoint || env.STORAGE_EXTERNAL_ENDPOINT) {
    return;
  }

  throw new Error(
    `Invalid S3 environment variables: STORAGE_EXTERNAL_ENDPOINT is required when STORAGE_VENDOR is minio and STORAGE_DOWNLOAD_URL_MODE is ${env.STORAGE_DOWNLOAD_URL_MODE}.`
  );
};

/* ===== sandbox ===== */
const isHttpOrWsUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' ||
        parsed.protocol === 'https:' ||
        parsed.protocol === 'ws:' ||
        parsed.protocol === 'wss:') &&
      parsed.username === '' &&
      parsed.password === ''
    );
  } catch {
    return false;
  }
};

const isCleanHttpUrl = (value: string): boolean => {
  if (!isHttpUrl(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
};

export const AgentSandboxProxyUrlSchema = z.string().refine(isHttpOrWsUrl, {
  message:
    'AGENT_SANDBOX_PROXY_URL must start with http://, https://, ws:// or wss:// without embedded credentials'
});

export const AgentSandboxPreviewProxyUrlSchema = z.string().refine(isCleanHttpUrl, {
  message:
    'AGENT_SANDBOX_PREVIEW_PROXY_URL must start with http:// or https:// without embedded credentials'
});

/**
 * 将 `AGENT_SANDBOX_PROXY_URL` 归一化派生为面向浏览器的 `/terminal` WebSocket 连接地址。
 * 支持运维填写 `http(s)://` 或 `ws(s)://` 基地址，并保留反向代理路径前缀。
 */
export const resolveAgentSandboxTerminalProxyUrl = (rawProxyUrl: string | undefined): string => {
  const trimmed = rawProxyUrl?.trim() ?? '';
  if (trimmed === '') {
    throw new Error('AGENT_SANDBOX_PROXY_URL environment variable is missing');
  }
  if (!isHttpOrWsUrl(trimmed)) {
    throw new Error('Invalid AGENT_SANDBOX_PROXY_URL');
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'ws:';
  } else if (parsed.protocol === 'https:') {
    parsed.protocol = 'wss:';
  }
  const basePath = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = basePath.endsWith('/terminal') ? basePath : `${basePath}/terminal`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
};

/**
 * 解析面向浏览器的静态文件预览 HTTP 基地址：
 * 优先使用显式配置的 `AGENT_SANDBOX_PREVIEW_PROXY_URL`（双端口隔离模式），
 * 未配置时自动将 `AGENT_SANDBOX_PROXY_URL` 归一化为 `http(s)://` 基地址。
 */
export const resolveAgentSandboxPreviewProxyBaseUrl = (params: {
  previewProxyUrl?: string;
  proxyUrl?: string;
}): string => {
  const explicitPreview = params.previewProxyUrl?.trim() ?? '';
  if (explicitPreview !== '') {
    if (!isCleanHttpUrl(explicitPreview)) {
      throw new Error('Invalid sandbox preview proxy URL');
    }
    const parsed = new URL(explicitPreview);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  }

  const fallbackProxy = params.proxyUrl?.trim() ?? '';
  if (fallbackProxy === '') {
    throw new Error(
      'AGENT_SANDBOX_PREVIEW_PROXY_URL or AGENT_SANDBOX_PROXY_URL environment variable is missing'
    );
  }
  if (!isHttpOrWsUrl(fallbackProxy)) {
    throw new Error('Invalid sandbox preview proxy URL');
  }

  const parsed = new URL(fallbackProxy);
  if (parsed.protocol === 'ws:') {
    parsed.protocol = 'http:';
  } else if (parsed.protocol === 'wss:') {
    parsed.protocol = 'https:';
  }
  const basePath = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = basePath.endsWith('/terminal')
    ? basePath.slice(0, -'/terminal'.length) || '/'
    : basePath || '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
};

const OPEN_SANDBOX_REQUIRED_ENV_KEYS = [
  'AGENT_SANDBOX_OPENSANDBOX_API_KEY',
  'AGENT_SANDBOX_OPENSANDBOX_IMAGE',
  'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL',
  'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN'
] as const;

/**
 * 判断运行环境是否配置了 OpenSandbox 控制面地址（作为启用 Agent Sandbox 的唯一开关）。
 */
export const hasOpenSandboxEnvConfig = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.AGENT_SANDBOX_OPENSANDBOX_BASEURL?.trim());

/**
 * 获取启用 Agent Sandbox 时缺失的运行态必填环境变量。
 * 未配置 `AGENT_SANDBOX_OPENSANDBOX_BASEURL` 时不启用沙盒，不要求任何配套变量。
 */
export const getAgentSandboxMissingRequiredEnvKeys = (env: NodeJS.ProcessEnv): string[] => {
  if (!hasOpenSandboxEnvConfig(env)) {
    return [];
  }

  return OPEN_SANDBOX_REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());
};

/** 校验已提供的沙盒代理地址协议合法性（`AGENT_SANDBOX_PROXY_URL` 支持 HTTP/WS，`AGENT_SANDBOX_PREVIEW_PROXY_URL` 仅支持 HTTP）。 */
const assertValidSandboxProxyUrls = ({
  proxyUrl,
  previewProxyUrl,
  requireProxyUrl
}: {
  proxyUrl: string;
  previewProxyUrl: string;
  requireProxyUrl: boolean;
}): void => {
  if (previewProxyUrl !== '' && !isCleanHttpUrl(previewProxyUrl)) {
    throw new Error(
      'Invalid Agent Sandbox preview proxy environment variable: AGENT_SANDBOX_PREVIEW_PROXY_URL must start with http:// or https://.'
    );
  }

  if ((requireProxyUrl || previewProxyUrl === '') && !isHttpOrWsUrl(proxyUrl)) {
    throw new Error(
      'Invalid Agent Sandbox proxy environment variable: AGENT_SANDBOX_PROXY_URL must start with http://, https://, ws:// or wss://.'
    );
  }
};

/**
 * 校验主站 `fastgpt-app` 连接 `opensandbox-proxy` 所需环境变量（`AGENT_SANDBOX_PROXY_URL` 与 `AGENT_SANDBOX_PROXY_SECRET`）。
 */
export const validateAgentSandboxProxyEnv = (env: NodeJS.ProcessEnv = process.env): void => {
  if (!hasOpenSandboxEnvConfig(env)) {
    return;
  }

  const missingKeys = (['AGENT_SANDBOX_PROXY_URL', 'AGENT_SANDBOX_PROXY_SECRET'] as const).filter(
    (key) => !env[key]?.trim()
  );
  if (missingKeys.length > 0) {
    throw new Error(
      `Invalid Agent Sandbox proxy environment variables: ${missingKeys.join(
        ', '
      )} are required when AGENT_SANDBOX_OPENSANDBOX_BASEURL is configured.`
    );
  }

  assertValidSandboxProxyUrls({
    proxyUrl: env.AGENT_SANDBOX_PROXY_URL!.trim(),
    previewProxyUrl: env.AGENT_SANDBOX_PREVIEW_PROXY_URL?.trim() ?? '',
    requireProxyUrl: true
  });
};

/**
 * 校验仅消费文件预览链接的服务（如 `pro/admin`）所需环境变量：允许配置 `AGENT_SANDBOX_PREVIEW_PROXY_URL` 或 `AGENT_SANDBOX_PROXY_URL`。
 */
export const validateAgentSandboxPreviewProxyEnv = (env: NodeJS.ProcessEnv = process.env): void => {
  if (!hasOpenSandboxEnvConfig(env)) {
    return;
  }

  const previewProxyUrl = env.AGENT_SANDBOX_PREVIEW_PROXY_URL?.trim() ?? '';
  const proxyUrl = env.AGENT_SANDBOX_PROXY_URL?.trim() ?? '';
  if (previewProxyUrl === '' && proxyUrl === '') {
    throw new Error(
      'Invalid Agent Sandbox preview proxy environment variable: AGENT_SANDBOX_PROXY_URL or AGENT_SANDBOX_PREVIEW_PROXY_URL is required when AGENT_SANDBOX_OPENSANDBOX_BASEURL is configured.'
    );
  }

  assertValidSandboxProxyUrls({
    proxyUrl,
    previewProxyUrl,
    requireProxyUrl: false
  });
};

/**
 * 校验 Agent 用户初始化环境变量。
 * 当配置了 AGENT_USERS 时，必须提供初始密码 DEFAULT_AGENT_PSW。
 */
export const validateAgentUsersEnv = (env: {
  AGENT_USERS?: string;
  DEFAULT_AGENT_PSW?: string;
}): void => {
  const agentUsernames = env.AGENT_USERS?.split(',')
    .map((username) => username.trim())
    .filter(Boolean);

  if (agentUsernames?.length && !env.DEFAULT_AGENT_PSW) {
    throw new Error(
      'Invalid environment configuration: DEFAULT_AGENT_PSW is required when AGENT_USERS is configured.'
    );
  }
};
