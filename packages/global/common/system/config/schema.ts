import z from 'zod';
import { AuthConfigSchema } from './schemas/auth';
import { CommercialConfigSchema } from './schemas/commercial';
import { FeatureConfigSchema } from './schemas/feature';
import { nonNegativeInteger } from './schemas/primitives';
import { PerformanceConfigSchema } from './schemas/performance';
import { ProvidersConfigSchema } from './schemas/providers';
import { ResourceConfigSchema } from './schemas/resource';
import { SecurityConfigSchema } from './schemas/security';
import { SiteConfigSchema } from './schemas/site';
import { StorageConfigSchema } from './schemas/storage';
import { SubserviceConfigSchema } from './schemas/subservice';
import { VectorConfigSchema } from './schemas/vector';

export const SYSTEM_INSTANCE_CONFIG_ID = 'instance' as const;
export const SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION = 1 as const;

/**
 * 实例级配置的唯一结构来源。所有字段都必须有默认值，确保首次初始化后 Mongo 文档就是完整快照。
 */
export const SystemInstanceConfigSchema = z
  .strictObject({
    site: SiteConfigSchema.prefault({}),
    auth: AuthConfigSchema.prefault({}),
    security: SecurityConfigSchema.prefault({}),
    feature: FeatureConfigSchema.prefault({}),
    commercial: CommercialConfigSchema.prefault({}),
    resource: ResourceConfigSchema.prefault({}),
    performance: PerformanceConfigSchema.prefault({}),
    storage: StorageConfigSchema.prefault({}),
    vector: VectorConfigSchema.prefault({}),
    providers: ProvidersConfigSchema.prefault({}),
    subservice: SubserviceConfigSchema.prefault({})
  })
  .superRefine((config, ctx) => {
    if (
      config.performance.workflow.parallelMaxConcurrency > config.performance.workflow.maxLoopTimes
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['performance', 'workflow', 'parallelMaxConcurrency'],
        message: 'parallelMaxConcurrency cannot exceed maxLoopTimes'
      });
    }

    const { aiProxy, agentSandbox, codeSandbox, plugin } = config.subservice;
    const { chunk, crm, documentParse } = config.providers;

    if (plugin.enabled && !plugin.token.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['subservice', 'plugin', 'token'],
        message: 'token is required when the plugin service is enabled'
      });
    }

    if (codeSandbox.enabled && !codeSandbox.token.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['subservice', 'codeSandbox', 'token'],
        message: 'token is required when the code sandbox is enabled'
      });
    }

    if (aiProxy.enabled && !aiProxy.token.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['subservice', 'aiProxy', 'token'],
        message: 'token is required when AI Proxy is enabled'
      });
    }

    if (chunk.enabled && (!chunk.url || !chunk.key.trim())) {
      ctx.addIssue({
        code: 'custom',
        path: ['providers', 'chunk'],
        message: 'url and key are required when intelligent chunking is enabled'
      });
    }

    if (crm.enabled && (!crm.apiUrl || !crm.apiKey.trim())) {
      ctx.addIssue({
        code: 'custom',
        path: ['providers', 'crm'],
        message: 'apiUrl and apiKey are required when CRM is enabled'
      });
    }

    if (documentParse.provider === 'customPdf' && !documentParse.customPdf.url) {
      ctx.addIssue({
        code: 'custom',
        path: ['providers', 'documentParse', 'customPdf', 'url'],
        message: 'url is required when custom PDF parsing is selected'
      });
    }

    if (documentParse.provider === 'sangfor' && !documentParse.sangfor.url) {
      ctx.addIssue({
        code: 'custom',
        path: ['providers', 'documentParse', 'sangfor', 'url'],
        message: 'url is required when Sangfor parsing is selected'
      });
    }

    if (agentSandbox.provider === 'sealosdevbox') {
      const { baseUrl, image, token } = agentSandbox.sealosdevbox;
      if (!baseUrl || !token.trim() || !image.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['subservice', 'agentSandbox', 'sealosdevbox'],
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
          path: ['subservice', 'agentSandbox', 'opensandbox'],
          message:
            'baseUrl, apiKey, image, volumeManagerUrl and volumeManagerToken are required for opensandbox'
        });
      }
    }
  });

export type SystemInstanceConfig = z.infer<typeof SystemInstanceConfigSchema>;

export const SystemInstanceConfigUpdatedBySchema = z.strictObject({
  userId: z.string().min(1).max(128).optional(),
  actor: z.enum(['admin', 'migration', 'system']),
  username: z.string().min(1).max(128).optional()
});

/** MongoDB 中 system_instance_configs 的完整单实例文档结构。 */
export const SystemInstanceConfigDocumentSchema = z.strictObject({
  _id: z.literal(SYSTEM_INSTANCE_CONFIG_ID).default(SYSTEM_INSTANCE_CONFIG_ID),
  schemaVersion: z
    .literal(SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION)
    .default(SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION),
  revision: nonNegativeInteger(0),
  config: SystemInstanceConfigSchema.prefault({}),
  updatedBy: SystemInstanceConfigUpdatedBySchema.optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

export type SystemInstanceConfigDocument = z.infer<typeof SystemInstanceConfigDocumentSchema>;

/** 解析并补全实例配置，供首次初始化、迁移和运行时快照加载复用。 */
export const parseSystemInstanceConfig = (input: unknown): SystemInstanceConfig =>
  SystemInstanceConfigSchema.parse(input);

/** 解析并补全 system_instance_configs MongoDB 文档，同时校验固定实例标识和 schema 版本。 */
export const parseSystemInstanceConfigDocument = (input: unknown): SystemInstanceConfigDocument =>
  SystemInstanceConfigDocumentSchema.parse(input);
