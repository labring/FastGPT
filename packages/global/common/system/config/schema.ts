import z from 'zod';
import { AuthConfigSchema } from './schemas/auth';
import { CommercialConfigSchema } from './schemas/commercial';
import { FeatureConfigSchema } from './schemas/feature';
import { nonNegativeInteger } from './schemas/primitives';
import { PerformanceConfigBaseSchema, PerformanceConfigSchema } from './schemas/performance';
import { ProvidersConfigBaseSchema, ProvidersConfigSchema } from './schemas/providers';
import { ResourceConfigSchema } from './schemas/resource';
import { SecurityConfigSchema } from './schemas/security';
import { SiteConfigSchema } from './schemas/site';
import { StorageConfigSchema } from './schemas/storage';
import { SubserviceConfigBaseSchema, SubserviceConfigSchema } from './schemas/subservice';
import { VectorConfigSchema } from './schemas/vector';
import { deepMergeConfig } from './merge';
import type { DeepPartial } from './type';

export const SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION = 1 as const;

export const SYSTEM_INSTANCE_CONFIG_DOMAINS = [
  'site',
  'auth',
  'security',
  'feature',
  'commercial',
  'resource',
  'performance',
  'storage',
  'vector',
  'providers',
  'subservice'
] as const;

export type SystemInstanceConfigDomainKey = (typeof SYSTEM_INSTANCE_CONFIG_DOMAINS)[number];

export const SystemInstanceConfigDomainKeySchema = z.enum(SYSTEM_INSTANCE_CONFIG_DOMAINS);

/**
 * 递归将 ZodObject 内的所有叶子和嵌套对象转换为严格且可选的 Partial Schema。
 */
export const makeDomainOverrideSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<{ [K in keyof T]: z.ZodTypeAny }> => {
  const shape = schema.shape;
  const newShape: Record<string, z.ZodTypeAny> = {};

  for (const key in shape) {
    newShape[key] = makeFieldPartial(shape[key] as any);
  }

  return z.strictObject(newShape) as any;
};

const makeFieldPartial = (fieldSchema: z.ZodTypeAny): z.ZodTypeAny => {
  const type = (fieldSchema as any)?.type ?? (fieldSchema as any)?._def?.type;

  if (type === 'object') {
    return makeDomainOverrideSchema(fieldSchema as any).optional();
  }
  if (type === 'default' || type === 'prefault') {
    const inner = (fieldSchema as any)?.def?.innerType ?? (fieldSchema as any)?._def?.innerType;
    return makeFieldPartial(inner);
  }
  if (type === 'optional') {
    const inner = (fieldSchema as any)?.def?.innerType ?? (fieldSchema as any)?._def?.innerType;
    return makeFieldPartial(inner).optional();
  }
  if (type === 'nullable') {
    const inner = (fieldSchema as any)?.def?.innerType ?? (fieldSchema as any)?._def?.innerType;
    return makeFieldPartial(inner).nullable().optional();
  }
  if (type === 'effects' || type === 'transform') {
    const inner = (fieldSchema as any)?.def?.schema ?? (fieldSchema as any)?._def?.schema;
    return makeFieldPartial(inner);
  }
  return fieldSchema.optional();
};

/**
 * 各 Domain 完整配置 Schema 映射表（含跨字段 superRefine 校验）。
 */
export const systemInstanceConfigDomainSchemaMap = {
  site: SiteConfigSchema,
  auth: AuthConfigSchema,
  security: SecurityConfigSchema,
  feature: FeatureConfigSchema,
  commercial: CommercialConfigSchema,
  resource: ResourceConfigSchema,
  performance: PerformanceConfigSchema,
  storage: StorageConfigSchema,
  vector: VectorConfigSchema,
  providers: ProvidersConfigSchema,
  subservice: SubserviceConfigSchema
} as const;

export type SystemInstanceConfigDomainMap = {
  site: z.infer<typeof SiteConfigSchema>;
  auth: z.infer<typeof AuthConfigSchema>;
  security: z.infer<typeof SecurityConfigSchema>;
  feature: z.infer<typeof FeatureConfigSchema>;
  commercial: z.infer<typeof CommercialConfigSchema>;
  resource: z.infer<typeof ResourceConfigSchema>;
  performance: z.infer<typeof PerformanceConfigSchema>;
  storage: z.infer<typeof StorageConfigSchema>;
  vector: z.infer<typeof VectorConfigSchema>;
  providers: z.infer<typeof ProvidersConfigSchema>;
  subservice: z.infer<typeof SubserviceConfigSchema>;
};

/**
 * 阶段 1: 各 Domain 稀疏 Overrides 校验 Schema 映射表。
 * - 递归派生自 strictObject；
 * - 严格继承 strict 语义，杜绝未知字段；
 * - 所有字段均为 optional。
 */
export const systemInstanceConfigDomainOverrideSchemaMap = {
  site: makeDomainOverrideSchema(SiteConfigSchema),
  auth: makeDomainOverrideSchema(AuthConfigSchema),
  security: makeDomainOverrideSchema(SecurityConfigSchema),
  feature: makeDomainOverrideSchema(FeatureConfigSchema),
  commercial: makeDomainOverrideSchema(CommercialConfigSchema),
  resource: makeDomainOverrideSchema(ResourceConfigSchema),
  performance: makeDomainOverrideSchema(PerformanceConfigBaseSchema),
  storage: makeDomainOverrideSchema(StorageConfigSchema),
  vector: makeDomainOverrideSchema(VectorConfigSchema),
  providers: makeDomainOverrideSchema(ProvidersConfigBaseSchema),
  subservice: makeDomainOverrideSchema(SubserviceConfigBaseSchema)
} as const;

/**
 * 获取指定 Domain 的完整内置默认配置。
 */
export const getDomainDefaultConfig = <T extends SystemInstanceConfigDomainKey>(
  domain: T
): SystemInstanceConfigDomainMap[T] => {
  const schema = systemInstanceConfigDomainSchemaMap[domain];
  return schema.parse({}) as SystemInstanceConfigDomainMap[T];
};

/**
 * 阶段 1 校验：校验提交的 overrides 形态与字段类型（拒绝未知字段）。
 */
export const parseDomainOverrides = <T extends SystemInstanceConfigDomainKey>(
  domain: T,
  overrides: unknown
): DeepPartial<SystemInstanceConfigDomainMap[T]> => {
  const schema = systemInstanceConfigDomainOverrideSchemaMap[domain];
  return schema.parse(overrides ?? {}) as DeepPartial<SystemInstanceConfigDomainMap[T]>;
};

/**
 * 两阶段校验核心：
 * 1. 阶段 1 校验 overrides 自身形态；
 * 2. 深度合并默认值与 overrides；
 * 3. 阶段 2 执行完整 DomainSchema（含 superRefine 跨字段校验）终审并返回生效配置。
 */
export const resolveDomainEffectiveConfig = <T extends SystemInstanceConfigDomainKey>(
  domain: T,
  overrides?: unknown
): SystemInstanceConfigDomainMap[T] => {
  const defaultValues = getDomainDefaultConfig(domain);
  const parsedOverrides = parseDomainOverrides(domain, overrides);
  const merged = deepMergeConfig(defaultValues, parsedOverrides);
  const fullSchema = systemInstanceConfigDomainSchemaMap[domain];
  return fullSchema.parse(merged) as SystemInstanceConfigDomainMap[T];
};

/**
 * 完整实例配置 Schema（包含所有 11 个 domain 的最终生效结构）。
 */
export const SystemInstanceConfigSchema = z.strictObject({
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
});

export type SystemInstanceConfig = z.infer<typeof SystemInstanceConfigSchema>;

/**
 * 给定各 Domain 的 overrides 字典，合成全量生效实例配置快照。
 */
export const resolveSystemInstanceConfig = (
  domainOverridesMap: Partial<{
    [K in SystemInstanceConfigDomainKey]: unknown;
  }> = {}
): SystemInstanceConfig => {
  return {
    site: resolveDomainEffectiveConfig('site', domainOverridesMap.site),
    auth: resolveDomainEffectiveConfig('auth', domainOverridesMap.auth),
    security: resolveDomainEffectiveConfig('security', domainOverridesMap.security),
    feature: resolveDomainEffectiveConfig('feature', domainOverridesMap.feature),
    commercial: resolveDomainEffectiveConfig('commercial', domainOverridesMap.commercial),
    resource: resolveDomainEffectiveConfig('resource', domainOverridesMap.resource),
    performance: resolveDomainEffectiveConfig('performance', domainOverridesMap.performance),
    storage: resolveDomainEffectiveConfig('storage', domainOverridesMap.storage),
    vector: resolveDomainEffectiveConfig('vector', domainOverridesMap.vector),
    providers: resolveDomainEffectiveConfig('providers', domainOverridesMap.providers),
    subservice: resolveDomainEffectiveConfig('subservice', domainOverridesMap.subservice)
  };
};

export const SystemInstanceConfigUpdatedBySchema = z.strictObject({
  userId: z.string().min(1).max(128).optional(),
  actor: z.enum(['admin', 'migration', 'system']),
  username: z.string().min(1).max(128).optional()
});

/**
 * MongoDB 中 system_instance_configs 的单个 Domain 文档结构。
 */
export const SystemInstanceDomainDocumentSchema = z.strictObject({
  _id: z.string().optional(),
  domain: SystemInstanceConfigDomainKeySchema,
  schemaVersion: z
    .literal(SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION)
    .default(SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION),
  revision: nonNegativeInteger(0),
  overrides: z.record(z.string(), z.unknown()).default({}),
  // 使用方明确保存为「内置默认值」而被剪枝的叶子路径（dotted）。
  // 用于区分「从未配置」与「明确清空/回到默认值」：迁移回填只能补前者。
  explicitDefaultPaths: z.array(z.string().min(1)).optional(),
  updatedBy: SystemInstanceConfigUpdatedBySchema.optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

export const SystemInstanceConfigDocumentSchema = SystemInstanceDomainDocumentSchema;

/** 解析全量生效配置，可用于初始快照构建。 */
export const parseSystemInstanceConfig = (input: unknown): SystemInstanceConfig =>
  SystemInstanceConfigSchema.parse(input);

/** 解析单个 Domain MongoDB 文档。 */
export const parseSystemInstanceDomainDocument = (input: unknown) =>
  SystemInstanceDomainDocumentSchema.parse(input);
export const parseSystemInstanceConfigDocument = parseSystemInstanceDomainDocument;
