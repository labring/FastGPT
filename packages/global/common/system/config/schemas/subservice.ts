import z from 'zod';
import { SANDBOX_VOLUME_NAME_RE } from '../../../../core/ai/sandbox/volume';
import {
  nonNegativeInteger,
  positiveInteger,
  positiveNumber,
  textWithDefault,
  urlWithDefault
} from './primitives';

const McpSubserviceConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  sseProxyUrl: urlWithDefault()
});

const PluginSubserviceConfigSchema = z.strictObject({
  enabled: z.boolean().default(true),
  baseUrl: urlWithDefault('http://localhost:3004'),
  token: textWithDefault('token'),
  remoteDebug: z.boolean().default(false),
  remoteDebugUrl: textWithDefault()
});

const CodeSandboxSubserviceConfigSchema = z.strictObject({
  enabled: z.boolean().default(true),
  baseUrl: urlWithDefault('http://localhost:3002'),
  token: textWithDefault('codesandbox')
});

const AiProxySubserviceConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  endpoint: urlWithDefault('http://localhost:3000'),
  token: textWithDefault()
});

const AgentSandboxProxyConfigSchema = z.strictObject({
  wsUrl: textWithDefault(),
  httpUrl: textWithDefault()
});

const AgentSandboxSubserviceConfigSchema = z.strictObject({
  provider: z.enum(['none', 'sealosdevbox', 'opensandbox']).default('none'),
  common: z
    .strictObject({
      cpuCount: positiveNumber(1),
      memoryMiB: positiveInteger(2048),
      storageSizeGi: positiveNumber(1),
      suspendMinutes: positiveInteger(60),
      archiveInactiveDays: positiveInteger(7),
      maxEditDebug: nonNegativeInteger(100),
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
      image: '',
      useServerProxy: true,
      volumeManagerUrl: '',
      volumeManagerToken: '',
      volumeNamePrefix: 'fastgpt-session'
    }),
  proxy: AgentSandboxProxyConfigSchema.prefault({
    wsUrl: '',
    httpUrl: ''
  })
});

export const SubserviceConfigBaseSchema = z.strictObject({
  plugin: PluginSubserviceConfigSchema.prefault({}),
  codeSandbox: CodeSandboxSubserviceConfigSchema.prefault({}),
  aiProxy: AiProxySubserviceConfigSchema.prefault({}),
  agentSandbox: AgentSandboxSubserviceConfigSchema.prefault({}),
  mcp: McpSubserviceConfigSchema.prefault({})
});

export const SubserviceConfigSchema = SubserviceConfigBaseSchema.superRefine((subservice, ctx) => {
  const { agentSandbox } = subservice;

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
