import z from 'zod';
import { SANDBOX_VOLUME_NAME_RE } from '../../../../core/ai/sandbox/volume';
import { isValidServiceBaseUrl } from '../../../string/url';
import {
  nonNegativeInteger,
  positiveInteger,
  positiveNumber,
  textWithDefault,
  urlWithDefault
} from './primitives';

/** 两类子服务均从此基地址追加固定路由；空值表示尚未配置。 */
const serviceBaseUrl = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidServiceBaseUrl(value), {
    message: 'Expected an HTTP(S) base URL without credentials, query or fragment'
  })
  .default('');

const McpSubserviceConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  sseProxyUrl: serviceBaseUrl
});

const CodeSandboxSubserviceConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  url: serviceBaseUrl,
  token: textWithDefault()
});

/** 浏览器代理统一配置；空值允许先保存禁用状态，启用时由共享终审和启动边界检查完整性。 */
export const AgentSandboxProxyConfigSchema = z.strictObject({
  wsUrl: z.union([z.url({ protocol: /^wss?$/ }), z.literal('')]).default(''),
  previewUrl: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).default(''),
  secret: textWithDefault()
});

const AgentSandboxSubserviceConfigSchema = z.strictObject({
  provider: z.enum(['none', 'sealosdevbox', 'opensandbox']).default('none'),
  proxy: AgentSandboxProxyConfigSchema.prefault({}),
  common: z
    .strictObject({
      cpuCount: positiveNumber(1),
      memoryMiB: positiveInteger(2048),
      // 与旧环境变量和管理表单的下限一致，保证磁盘预留后仍有可用空间。
      storageSizeGi: z.number().min(1).default(1),
      suspendMinutes: positiveInteger(60),
      archiveInactiveDays: positiveInteger(7),
      maxEditDebug: nonNegativeInteger(100),
      // 单团队活跃实例配额；null 表示不限制
      maxPerTeam: z.number().int().positive().nullable().default(null),
      entrypointTimeoutSeconds: z.number().int().min(1).max(600).default(30),
      wsMaxMessageBytes: positiveInteger(64 * 1024 * 1024),
      wsMaxFrameBytes: positiveInteger(16 * 1024 * 1024),
      npmRegistry: textWithDefault(),
      pypiIndexUrl: textWithDefault(),
      aptMirror: textWithDefault()
    })
    .prefault({}),
  sealosdevbox: z
    .strictObject({
      baseUrl: urlWithDefault(),
      token: textWithDefault(),
      workDirectory: z.string().default('/home/devbox/workspace'),
      image: textWithDefault()
    })
    .prefault({
      baseUrl: '',
      token: '',
      workDirectory: '/home/devbox/workspace',
      image: ''
    }),
  opensandbox: z
    .strictObject({
      baseUrl: urlWithDefault(),
      apiKey: textWithDefault(),
      runtime: z.enum(['docker', 'kubernetes']).default('docker'),
      cpuOvercommitFactor: z.number().min(1).default(1),
      memoryOvercommitFactor: z.number().min(1).default(1),
      image: textWithDefault(),
      useServerProxy: z.boolean().default(true),
      volumeManagerUrl: urlWithDefault(),
      volumeManagerToken: textWithDefault(),
      // 与 env 侧 SandboxVolumeNameSchema 对齐：前缀会拼进 PVC/named volume 名，
      // 必须满足 DNS label 子集，否则运行时 createSessionVolumeName 的 parse 会抛错。
      // 保留 max(100)：前缀 + sandboxId 需容纳在 253 字符的 DNS label 内。
      volumeNamePrefix: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(SANDBOX_VOLUME_NAME_RE, {
          message: 'Volume name prefix must use lowercase alphanumeric characters and hyphens'
        })
        .default('fastgpt-session')
    })
    .prefault({
      baseUrl: '',
      apiKey: '',
      runtime: 'docker',
      cpuOvercommitFactor: 1,
      memoryOvercommitFactor: 1,
      image: '',
      useServerProxy: true,
      volumeManagerUrl: '',
      volumeManagerToken: '',
      volumeNamePrefix: 'fastgpt-session'
    })
});

export const SubserviceConfigBaseSchema = z.strictObject({
  codeSandbox: CodeSandboxSubserviceConfigSchema.prefault({}),
  agentSandbox: AgentSandboxSubserviceConfigSchema.prefault({}),
  mcp: McpSubserviceConfigSchema.prefault({})
});

export const SubserviceConfigSchema = SubserviceConfigBaseSchema.superRefine((subservice, ctx) => {
  const { agentSandbox } = subservice;

  // 启用任一供应商都依赖完整代理配置，必须在保存前拒绝不完整状态。
  if (agentSandbox.provider !== 'none') {
    for (const key of ['wsUrl', 'previewUrl', 'secret'] as const) {
      if (!agentSandbox.proxy[key].trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['agentSandbox', 'proxy', key],
          message: `${key} is required when Agent Sandbox is enabled`
        });
      }
    }
  }

  // Admin 提交的掩码先由配置服务恢复；终审在恢复后检查真实密钥，不能把 ****** 当成新密钥。
  if (agentSandbox.proxy.secret && agentSandbox.proxy.secret.length < 32) {
    ctx.addIssue({
      code: 'custom',
      path: ['agentSandbox', 'proxy', 'secret'],
      message: 'Agent Sandbox proxy secret must be at least 32 characters'
    });
  }

  if (agentSandbox.provider === 'sealosdevbox') {
    const { baseUrl } = agentSandbox.sealosdevbox;
    if (!baseUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['agentSandbox', 'sealosdevbox', 'baseUrl'],
        message: 'baseUrl is required for sealosdevbox'
      });
    }
  }

  if (agentSandbox.provider === 'opensandbox') {
    const { baseUrl } = agentSandbox.opensandbox;
    if (!baseUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['agentSandbox', 'opensandbox', 'baseUrl'],
        message: 'baseUrl is required for opensandbox'
      });
    }
  }
});
