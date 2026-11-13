import { IntSchema } from '@fastgpt/global/common/zod';
import { z } from 'zod';

const DEFAULT_JUICEFS_BUCKET = 'http://fastgpt-sandbox-rustfs:9000/fastgpt-sandbox';

/**
 * Volume Manager 环境变量校验规则。
 *
 * - `VM_RUNTIME` 默认与主站 `AGENT_SANDBOX_OPENSANDBOX_RUNTIME` 对齐为 `docker`。
 * - `docker` 模式强制校验 `VM_JUICEFS_META_URL` 非空；默认内置 `minio` / `fastgpt-sandbox-rustfs` 强制要求静态 `VM_JUICEFS_ACCESS_KEY` 与 `VM_JUICEFS_SECRET_KEY`，
 *   外接云对象存储（如 `s3` / `oss` / `cos` / `obs`）支持成对配置静态 AK/SK 或同时留空以复用云主机 IAM Role / RAM 角色凭证，禁止只配其一。
 * - `kubernetes` 模式强制校验 `VM_K8S_NAMESPACE` 与 `VM_K8S_PVC_STORAGE_CLASS` 非空，禁止任何静默回退。
 */
export const volumeManagerEnvSchema = z
  .object({
    PORT: IntSchema.default(3000),
    VM_AUTH_TOKEN: z.string().min(1),
    VM_RUNTIME: z.enum(['docker', 'kubernetes']).default('docker'),
    VM_JUICEFS_META_URL: z.string().trim().default(''),
    VM_JUICEFS_STORAGE: z.string().trim().min(1).default('minio'),
    VM_JUICEFS_BUCKET: z.string().trim().min(1).default(DEFAULT_JUICEFS_BUCKET),
    VM_JUICEFS_ACCESS_KEY: z.string().trim().default(''),
    VM_JUICEFS_SECRET_KEY: z.string().trim().default(''),
    VM_K8S_NAMESPACE: z.string().trim().default(''),
    VM_K8S_PVC_STORAGE_CLASS: z.string().trim().default('')
  })
  .superRefine((data, ctx) => {
    if (data.VM_RUNTIME === 'docker') {
      if (data.VM_JUICEFS_META_URL.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['VM_JUICEFS_META_URL'],
          message: 'VM_JUICEFS_META_URL is required when VM_RUNTIME=docker'
        });
      }

      const hasAccessKey = data.VM_JUICEFS_ACCESS_KEY.length > 0;
      const hasSecretKey = data.VM_JUICEFS_SECRET_KEY.length > 0;
      const requiresStaticKeys =
        data.VM_JUICEFS_STORAGE.toLowerCase() === 'minio' ||
        data.VM_JUICEFS_BUCKET === DEFAULT_JUICEFS_BUCKET;

      if (requiresStaticKeys) {
        if (!hasAccessKey) {
          ctx.addIssue({
            code: 'custom',
            path: ['VM_JUICEFS_ACCESS_KEY'],
            message: 'VM_JUICEFS_ACCESS_KEY is required when VM_RUNTIME=docker'
          });
        }
        if (!hasSecretKey) {
          ctx.addIssue({
            code: 'custom',
            path: ['VM_JUICEFS_SECRET_KEY'],
            message: 'VM_JUICEFS_SECRET_KEY is required when VM_RUNTIME=docker'
          });
        }
      } else if (hasAccessKey !== hasSecretKey) {
        const missingKey = hasAccessKey ? 'VM_JUICEFS_SECRET_KEY' : 'VM_JUICEFS_ACCESS_KEY';
        ctx.addIssue({
          code: 'custom',
          path: [missingKey],
          message: `${missingKey} must be set together with its counterpart when using static object storage credentials`
        });
      }
      return;
    }

    for (const key of ['VM_K8S_NAMESPACE', 'VM_K8S_PVC_STORAGE_CLASS'] as const) {
      if (data[key].length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            key === 'VM_K8S_PVC_STORAGE_CLASS'
              ? 'VM_K8S_PVC_STORAGE_CLASS is required when VM_RUNTIME=kubernetes and must reference a JuiceFS StorageClass'
              : 'VM_K8S_NAMESPACE is required when VM_RUNTIME=kubernetes'
        });
      }
    }
  });

export type VolumeManagerEnv = z.infer<typeof volumeManagerEnvSchema>;

/**
 * 解析并强校验 Volume Manager 启动环境变量；失败时抛出包含字段名与具体约束原因的错误。
 */
export function parseVolumeManagerEnv(rawEnv: NodeJS.ProcessEnv = process.env): VolumeManagerEnv {
  const result = volumeManagerEnvSchema.safeParse(rawEnv);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`[volume-manager] Invalid environment variables: ${details}`);
  }
  return result.data;
}

export const env: VolumeManagerEnv = (() => {
  if (process.env.VITEST === 'true') {
    const parsed = volumeManagerEnvSchema.safeParse(process.env);
    if (parsed.success) return parsed.data;
    return {
      PORT: 3000,
      VM_AUTH_TOKEN: 'vitest-default-token',
      VM_RUNTIME: 'docker',
      VM_JUICEFS_META_URL: 'postgres://postgres:password@localhost:5432/juicefs',
      VM_JUICEFS_STORAGE: 'minio',
      VM_JUICEFS_BUCKET: DEFAULT_JUICEFS_BUCKET,
      VM_JUICEFS_ACCESS_KEY: 'vitest-ak',
      VM_JUICEFS_SECRET_KEY: 'vitest-sk',
      VM_K8S_NAMESPACE: 'opensandbox',
      VM_K8S_PVC_STORAGE_CLASS: 'juicefs-sc'
    };
  }

  try {
    return parseVolumeManagerEnv(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();
