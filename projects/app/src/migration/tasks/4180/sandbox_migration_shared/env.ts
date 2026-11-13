/**
 * 4.18.0 沙箱迁移专用环境变量解析与错误脱敏工具。
 *
 * 严格内聚于 `tasks/4180/` 目录，不向全局 `packages/service/env.ts` 注入已下线的 Sealos 或临时迁移配置。
 */
import { IntSchema } from '@fastgpt/global/common/zod';
import { getVolumeManagerEnvConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/config';
import { serviceEnv } from '@fastgpt/service/env';
import { z } from 'zod';

const DEFAULT_SEALOS_WORK_DIRECTORY = '/home/devbox/workspace';
const MAX_ERROR_MESSAGE_LENGTH = 300;

const SandboxMigrationEnvSchema = z.object({
  SYSTEM_MIGRATION_SANDBOX_CONCURRENCY: IntSchema.min(1).max(20).default(5),
  AGENT_SANDBOX_SEALOS_BASEURL: z.string().trim().url().optional(),
  AGENT_SANDBOX_SEALOS_TOKEN: z.string().trim().min(1).optional(),
  AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .default(DEFAULT_SEALOS_WORK_DIRECTORY),
  AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL: z.string().trim().url().optional(),
  AGENT_SANDBOX_LEGACY_OPENSANDBOX_API_KEY: z.string().trim().min(1).optional(),
  AGENT_SANDBOX_LEGACY_OPENSANDBOX_IMAGE: z.string().trim().min(1).optional(),
  AGENT_SANDBOX_LEGACY_OPENSANDBOX_RUNTIME: z.enum(['docker', 'kubernetes']).default('docker'),
  AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL: z.string().trim().url().optional(),
  AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_TOKEN: z.string().trim().min(1).optional()
});

export type SandboxMigrationEnv = {
  concurrency: number;
  sealosBaseUrl?: string;
  sealosToken?: string;
  sealosWorkDirectory: string;
  legacyOpenSandboxBaseUrl?: string;
  legacyOpenSandboxApiKey?: string;
  legacyOpenSandboxImage?: string;
  legacyOpenSandboxRuntime: 'docker' | 'kubernetes';
  legacyVolumeManagerUrl?: string;
  legacyVolumeManagerToken?: string;
};

export type LegacyOpenSandboxSourceConfig = {
  openSandbox: {
    baseUrl: string;
    apiKey?: string;
    image: string;
    runtime: 'docker' | 'kubernetes';
  };
  volumeManager: {
    url: string;
    token?: string;
    volumeNamePrefix: string;
  };
};

const normalizeEndpointUrl = (url?: string): string | undefined => {
  const trimmed = url?.trim().replace(/\/+$/, '');
  return trimmed || undefined;
};

/**
 * 按需解析迁移专用环境变量（兼容空字符串缺省值，便于测试动态切换 `process.env`）。
 */
export function getSandboxMigrationEnv(
  rawEnv: NodeJS.ProcessEnv = process.env
): SandboxMigrationEnv {
  const normalizedInput = {
    SYSTEM_MIGRATION_SANDBOX_CONCURRENCY:
      rawEnv.SYSTEM_MIGRATION_SANDBOX_CONCURRENCY?.trim() || undefined,
    AGENT_SANDBOX_SEALOS_BASEURL: rawEnv.AGENT_SANDBOX_SEALOS_BASEURL?.trim() || undefined,
    AGENT_SANDBOX_SEALOS_TOKEN: rawEnv.AGENT_SANDBOX_SEALOS_TOKEN?.trim() || undefined,
    AGENT_SANDBOX_SEALOS_WORK_DIRECTORY:
      rawEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY?.trim() || undefined,
    AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL:
      rawEnv.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL?.trim() || undefined,
    AGENT_SANDBOX_LEGACY_OPENSANDBOX_API_KEY:
      rawEnv.AGENT_SANDBOX_LEGACY_OPENSANDBOX_API_KEY?.trim() || undefined,
    AGENT_SANDBOX_LEGACY_OPENSANDBOX_IMAGE:
      rawEnv.AGENT_SANDBOX_LEGACY_OPENSANDBOX_IMAGE?.trim() || undefined,
    AGENT_SANDBOX_LEGACY_OPENSANDBOX_RUNTIME:
      rawEnv.AGENT_SANDBOX_LEGACY_OPENSANDBOX_RUNTIME?.trim() || undefined,
    AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL:
      rawEnv.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL?.trim() || undefined,
    AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_TOKEN:
      rawEnv.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_TOKEN?.trim() || undefined
  };

  const parsed = SandboxMigrationEnvSchema.parse(normalizedInput);
  return {
    concurrency: parsed.SYSTEM_MIGRATION_SANDBOX_CONCURRENCY,
    sealosBaseUrl: parsed.AGENT_SANDBOX_SEALOS_BASEURL,
    sealosToken: parsed.AGENT_SANDBOX_SEALOS_TOKEN,
    sealosWorkDirectory:
      parsed.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY.replace(/\/+$/, '') ||
      DEFAULT_SEALOS_WORK_DIRECTORY,
    legacyOpenSandboxBaseUrl: parsed.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL,
    legacyOpenSandboxApiKey: parsed.AGENT_SANDBOX_LEGACY_OPENSANDBOX_API_KEY,
    legacyOpenSandboxImage: parsed.AGENT_SANDBOX_LEGACY_OPENSANDBOX_IMAGE,
    legacyOpenSandboxRuntime: parsed.AGENT_SANDBOX_LEGACY_OPENSANDBOX_RUNTIME,
    legacyVolumeManagerUrl: parsed.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL,
    legacyVolumeManagerToken: parsed.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_TOKEN
  };
}

/**
 * 解析跨运行时 / 跨集群旧版 OpenSandbox 源端配置（例如旧 Docker OpenSandbox -> 新 K8s OpenSandbox）。
 *
 * - 未配置独立源端（或源端 URL 与当前 v3 目标端完全一致）时返回 `undefined`，走同集群双挂载快路径；
 * - 若只配置了 `AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL` 与 `AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL` 之一，
 *   立即抛出配置错误阻断执行，防止误连错误的 `volume-manager` 或控制面。
 */
export function resolveLegacyOpenSandboxSourceConfig(
  rawEnv: NodeJS.ProcessEnv = process.env
): LegacyOpenSandboxSourceConfig | undefined {
  const migrationEnv = getSandboxMigrationEnv(rawEnv);
  const legacyOsUrl = normalizeEndpointUrl(migrationEnv.legacyOpenSandboxBaseUrl);
  const legacyVmUrl = normalizeEndpointUrl(migrationEnv.legacyVolumeManagerUrl);
  if (!legacyOsUrl && !legacyVmUrl) {
    return undefined;
  }

  const targetOsUrl = normalizeEndpointUrl(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL);
  const targetVmConfig = (() => {
    try {
      return getVolumeManagerEnvConfig();
    } catch {
      return undefined;
    }
  })();
  const targetVmUrl = normalizeEndpointUrl(targetVmConfig?.url);

  const hasSeparateOs = Boolean(legacyOsUrl && legacyOsUrl !== targetOsUrl);
  const hasSeparateVm = Boolean(legacyVmUrl && legacyVmUrl !== targetVmUrl);
  if (!hasSeparateOs && !hasSeparateVm) {
    return undefined;
  }
  if (!legacyOsUrl || !legacyVmUrl) {
    throw new Error(
      'Both AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL and AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL must be configured when migrating across separate OpenSandbox runtimes/clusters'
    );
  }

  const image = (
    migrationEnv.legacyOpenSandboxImage ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE
  )?.trim();
  if (!image) {
    throw new Error(
      'AGENT_SANDBOX_LEGACY_OPENSANDBOX_IMAGE or AGENT_SANDBOX_OPENSANDBOX_IMAGE is required for cross-cluster OpenSandbox migration'
    );
  }

  return {
    openSandbox: {
      baseUrl: legacyOsUrl,
      apiKey: migrationEnv.legacyOpenSandboxApiKey ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
      image,
      runtime: migrationEnv.legacyOpenSandboxRuntime
    },
    volumeManager: {
      url: legacyVmUrl,
      token:
        migrationEnv.legacyVolumeManagerToken ??
        targetVmConfig?.token ??
        serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN,
      volumeNamePrefix:
        targetVmConfig?.volumeNamePrefix ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX
    }
  };
}

/**
 * 将迁移异常转换为可安全持久化到 `failedRecords` 的短摘要，剥离凭证、连接串与调用栈帧，
 * 同时保留 Python / Shell 多行输出末尾的真实异常原因。
 */
export function sanitizeMigrationErrorMessage(
  error: unknown,
  extraSecrets: Array<string | undefined> = []
): string {
  // Zod 校验错误的默认 message 是多行 JSON 数组，直接按首尾行拼接会退化为 `[ -> ]`，需提取字段路径与原因。
  const rawMessage =
    error instanceof z.ZodError
      ? error.issues
          .map((issue) => {
            const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '<root>';
            return `${fieldPath}: ${issue.message}`;
          })
          .join('; ') || 'Schema validation failed'
      : error instanceof Error
        ? error.message
        : String(error);
  const meaningfulLines = rawMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 && !/^at\s+/.test(line) && !/^File\s+"/.test(line) && !/^\^+$/.test(line)
    );
  const firstLine = meaningfulLines[0] || 'Unknown sandbox migration error';
  const lastLine = meaningfulLines[meaningfulLines.length - 1];
  const combinedLine =
    lastLine && lastLine !== firstLine ? `${firstLine} -> ${lastLine}` : firstLine;

  let sanitized = combinedLine
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, '$1[REDACTED]@');

  const secrets = [
    process.env.AGENT_SANDBOX_SEALOS_TOKEN?.trim(),
    process.env.AGENT_SANDBOX_LEGACY_OPENSANDBOX_API_KEY?.trim(),
    process.env.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_TOKEN?.trim(),
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN,
    ...extraSecrets
  ];

  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      sanitized = sanitized.replaceAll(secret, '[REDACTED]');
    }
  }

  return sanitized.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${sanitized.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`
    : sanitized;
}
