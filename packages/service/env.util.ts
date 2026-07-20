import type { SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import { agentSandboxProviderList } from '@fastgpt/global/core/ai/sandbox/constants';
import z from 'zod';
import type { StorageDownloadUrlMode } from './common/s3/contracts/type';
import type { StorageVendorSchema } from './env.const';

const TEST_INVOKE_TOKEN_SECRET = 'fastgpt_test_invoke_token_secret_32';
const TEST_PRO_TOKEN = 'fastgpt_test_pro_token_32_chars_min';
/**
 * 测试套件会在多个 workspace（包含 pro/admin 子模块）里直接导入 serviceEnv。
 * INVOKE_TOKEN_SECRET 生产启动仍要求显式配置；PRO_TOKEN 仅在启用 Pro 内部调用时配置。
 * 仅 Vitest/测试环境允许注入稳定测试密钥，避免每个测试项目都重复维护同一组运行时密钥。
 */
export const getRuntimeEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
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
export const AgentSandboxProxyUrlSchema = z.string().refine((url) => /^wss?:\/\//.test(url), {
  message: 'AGENT_SANDBOX_PROXY_URL must start with ws:// or wss://'
});
export const AgentSandboxPreviewProxyUrlSchema = z
  .string()
  .refine((url) => /^https?:\/\//.test(url), {
    message: 'AGENT_SANDBOX_PREVIEW_PROXY_URL must start with http:// or https://'
  });
const agentSandboxProviderRequiredEnvKeys = {
  sealosdevbox: [
    'AGENT_SANDBOX_SEALOS_BASEURL',
    'AGENT_SANDBOX_SEALOS_TOKEN',
    'AGENT_SANDBOX_SEALOS_IMAGE'
  ],
  opensandbox: [
    'AGENT_SANDBOX_OPENSANDBOX_BASEURL',
    'AGENT_SANDBOX_OPENSANDBOX_API_KEY',
    'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL',
    'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN'
  ]
} satisfies Record<SandboxProviderType, readonly string[]>;

export const isAgentSandboxProvider = (
  provider: string | undefined
): provider is SandboxProviderType =>
  agentSandboxProviderList.includes(provider as SandboxProviderType);

/**
 * 获取已配置 provider 缺失的运行态必填环境变量。
 * 未配置合法 provider 时不启用 Agent Sandbox，因此不要求任何 provider 配套变量。
 */
export const getAgentSandboxMissingRequiredEnvKeys = (env: NodeJS.ProcessEnv): string[] => {
  const provider = env.AGENT_SANDBOX_PROVIDER;
  if (!isAgentSandboxProvider(provider)) {
    return [];
  }

  return agentSandboxProviderRequiredEnvKeys[provider].filter((key) => !env[key]);
};

/* ===== Sandbox proxy ===== */
const agentSandboxProxyRequiredEnvKeys = [
  'AGENT_SANDBOX_PROXY_SECRET',
  'AGENT_SANDBOX_PROXY_URL',
  'AGENT_SANDBOX_PREVIEW_PROXY_URL'
] as const;
/**
 * 校验 FastGPT app 浏览器直连 agent-sandbox-proxy 所需环境变量。
 * 该能力只属于主站 app 的 sandbox editor/proxy 链路，不能放在共享 serviceEnv 中校验，
 * 否则 pro/admin 等只复用服务端能力的项目会被不必要的 proxy 配置阻塞。
 */
export const validateAgentSandboxProxyEnv = (): void => {
  const provider = process.env.AGENT_SANDBOX_PROVIDER;
  if (!agentSandboxProviderList.includes(provider as (typeof agentSandboxProviderList)[number])) {
    return;
  }

  const missingAgentSandboxProxyEnvKeys = agentSandboxProxyRequiredEnvKeys.filter(
    (key) => !process.env[key]
  );
  if (missingAgentSandboxProxyEnvKeys.length === 0) {
    return;
  }

  throw new Error(
    `Invalid Agent Sandbox proxy environment variables: ${missingAgentSandboxProxyEnvKeys.join(
      ', '
    )} are required when AGENT_SANDBOX_PROVIDER is ${provider}.`
  );
};
