/**
 * Skill Sandbox Configuration
 *
 * Provides configuration and defaults for sandbox management.
 */

import type { SandboxImageConfigType } from '@fastgpt/global/core/agentSkills/type';

/** Parse an integer from an env-var string, returning defaultValue when the result is NaN. */
function safeParseInt(value: string | undefined, defaultValue: number): number {
  const n = parseInt(value ?? '', 10);
  return isNaN(n) ? defaultValue : n;
}

export type SandboxProviderConfig = {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  runtime: 'kubernetes' | 'docker';
};

export type SandboxDefaults = {
  timeout: number; // in seconds
  cleanupInterval: number; // in milliseconds
  inactiveThreshold: number; // in seconds
  defaultImage: SandboxImageConfigType;
  homeDirectory: string;
  workDirectory: string;
  targetPort: number;
};

/**
 * Get sandbox provider configuration from environment variables
 */
export function getSandboxProviderConfig(): SandboxProviderConfig {
  const provider = process.env.SANDBOX_PROVIDER_NAME || 'opensandbox';
  const baseUrl = process.env.SANDBOX_PROVIDER_BASE_URL || 'http://127.0.0.1:8080';
  const apiKey = process.env.SANDBOX_PROVIDER_API_KEY;
  const runtime = (process.env.SANDBOX_PROVIDER_RUNTIME || 'kubernetes') as 'kubernetes' | 'docker';

  return {
    provider,
    baseUrl,
    apiKey,
    runtime
  };
}

/**
 * Get sandbox default settings
 */
export function getSandboxDefaults(): SandboxDefaults {
  return {
    timeout: safeParseInt(process.env.SANDBOX_DEFAULT_TIMEOUT, 600), // 10 minutes, Automatic termination timeout (server-side TTL)
    cleanupInterval: safeParseInt(process.env.SANDBOX_CLEANUP_INTERVAL, 3600000),
    inactiveThreshold: safeParseInt(process.env.SANDBOX_INACTIVE_THRESHOLD, 7200),
    defaultImage: {
      repository: process.env.SANDBOX_DEFAULT_IMAGE || 'node',
      tag: process.env.SANDBOX_DEFAULT_IMAGE_TAG || '18-alpine'
    },
    homeDirectory: '/home/coder',
    workDirectory: '/workspace/projects',
    targetPort: 8080
  };
}

export type SkillSizeLimits = {
  maxUploadBytes: number; // Compressed upload size limit
  maxUncompressedBytes: number; // Uncompressed size after extraction (Zip Bomb guard)
  maxDownloadBytes: number; // Download from MinIO/S3
  maxSandboxPackageBytes: number; // Sandbox directory size before zip
};

/**
 * Get skill size limits from environment variables
 */
export function getSkillSizeLimits(): SkillSizeLimits {
  return {
    maxUploadBytes: safeParseInt(process.env.AGENT_SKILL_MAX_UPLOAD_SIZE, 50 * 1024 * 1024),
    maxUncompressedBytes: safeParseInt(
      process.env.AGENT_SKILL_MAX_UNCOMPRESSED_SIZE,
      200 * 1024 * 1024
    ),
    maxDownloadBytes: safeParseInt(process.env.AGENT_SKILL_MAX_DOWNLOAD_SIZE, 200 * 1024 * 1024),
    maxSandboxPackageBytes: safeParseInt(
      process.env.AGENT_SKILL_MAX_SANDBOX_SIZE,
      200 * 1024 * 1024
    )
  };
}

/**
 * Validate sandbox configuration
 */
export function validateSandboxConfig(config: SandboxProviderConfig): void {
  if (!config.baseUrl) {
    throw new Error('Sandbox provider base URL is required');
  }

  if (!['kubernetes', 'docker'].includes(config.runtime)) {
    throw new Error(`Invalid runtime: ${config.runtime}`);
  }
}

/**
 * Docker 运行时下注入 Sync Agent 所需的环境变量
 *
 * K8s 运行时不需要此函数：SESSION_ID 由 Sync Agent Sidecar 从 Pod label 读取，
 * MinIO 凭证通过 K8s Secret 挂载到 Sidecar 容器，FastGPT 侧只需在 metadata 传 sessionId。
 *
 * @param sessionId  会话唯一 ID，作为 MinIO 存储路径前缀（sessions/{sessionId}/）
 * @param syncPath   沙箱内需要同步的目录，通常为 workDirectory
 * @param enableCodeServer 是否启动 code-server，editDebug 模式为 true，session-runtime 为 false
 */
export function buildDockerSyncEnv(
  sessionId: string,
  syncPath: string,
  enableCodeServer: boolean
): Record<string, string> {
  const endpoint = process.env.STORAGE_S3_ENDPOINT;
  const accessKey = process.env.STORAGE_ACCESS_KEY_ID;
  const secretKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const bucket = process.env.STORAGE_PRIVATE_BUCKET || 'fastgpt-private';

  if (!endpoint || !accessKey || !secretKey) {
    throw new Error(
      'Missing required storage configuration: STORAGE_S3_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY must be set'
    );
  }

  return {
    SESSION_ID: sessionId,
    MINIO_ENDPOINT: endpoint,
    MINIO_ACCESS_KEY: accessKey,
    MINIO_SECRET_KEY: secretKey,
    MINIO_BUCKET: bucket,
    SYNC_PATH: syncPath,
    ENABLE_CODE_SERVER: enableCodeServer ? 'true' : 'false'
  };
}
