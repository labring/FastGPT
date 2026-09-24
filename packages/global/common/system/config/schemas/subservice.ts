import z from 'zod';
import {
  nonNegativeInteger,
  positiveInteger,
  positiveNumber,
  textWithDefault,
  urlWithDefault
} from './primitives';

const PluginSubserviceConfigSchema = z.strictObject({
  enabled: z.boolean().default(true),
  baseUrl: urlWithDefault('http://localhost:3004'),
  token: textWithDefault('token')
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
      volumeNamePrefix: z.string().min(1).max(100).default('fastgpt-session')
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
    })
});

export const SubserviceConfigBaseSchema = z.strictObject({
  plugin: PluginSubserviceConfigSchema.prefault({}),
  codeSandbox: CodeSandboxSubserviceConfigSchema.prefault({}),
  aiProxy: AiProxySubserviceConfigSchema.prefault({}),
  agentSandbox: AgentSandboxSubserviceConfigSchema.prefault({})
});

export const SubserviceConfigSchema = SubserviceConfigBaseSchema.superRefine((subservice, ctx) => {
  const { aiProxy, agentSandbox, codeSandbox, plugin } = subservice;

  if (plugin.enabled && !plugin.token.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['plugin', 'token'],
      message: 'token is required when the plugin service is enabled'
    });
  }

  if (codeSandbox.enabled && !codeSandbox.token.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['codeSandbox', 'token'],
      message: 'token is required when the code sandbox is enabled'
    });
  }

  if (aiProxy.enabled && !aiProxy.token.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['aiProxy', 'token'],
      message: 'token is required when AI Proxy is enabled'
    });
  }

  if (agentSandbox.provider === 'sealosdevbox') {
    const { baseUrl, image, token } = agentSandbox.sealosdevbox;
    if (!baseUrl || !token.trim() || !image.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['agentSandbox', 'sealosdevbox'],
        message: 'baseUrl, token and image are required for sealosdevbox'
      });
    }
  }

  if (agentSandbox.provider === 'opensandbox') {
    const { apiKey, baseUrl, image, volumeManagerToken, volumeManagerUrl } =
      agentSandbox.opensandbox;
    if (
      !baseUrl ||
      !apiKey.trim() ||
      !image.trim() ||
      !volumeManagerUrl ||
      !volumeManagerToken.trim()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['agentSandbox', 'opensandbox'],
        message:
          'baseUrl, apiKey, image, volumeManagerUrl and volumeManagerToken are required for opensandbox'
      });
    }
  }
});
