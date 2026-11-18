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
import { systemInstanceConfigScopeSchemaMap } from './scopes';
import { RuntimeLicenseDataSchema } from '../license/schema';

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

/** 持久化 scope 包含 11 个业务域及 6 个辅助系统配置；辅助 scope 不参与表单和业务域初始化。 */
export const SYSTEM_INSTANCE_CONFIG_SCOPES = [
  ...SYSTEM_INSTANCE_CONFIG_DOMAINS,
  'proEnv',
  'license',
  'instanceId',
  'modelStatusProbe',
  'moderationPolicy',
  'operations'
] as const;
export const SystemInstanceConfigScopeKeySchema = z.enum(SYSTEM_INSTANCE_CONFIG_SCOPES);
export type SystemInstanceConfigScopeKey = z.infer<typeof SystemInstanceConfigScopeKeySchema>;

/**
 * 递归将 ZodObject 内的所有叶子和嵌套对象转换为严格且可选的 Partial Schema。
 */
export const makeDomainOverrideSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  options?: { strict?: boolean }
): z.ZodObject<{ [K in keyof T]: z.ZodTypeAny }> => {
  const shape = schema.shape;
  const newShape: Record<string, z.ZodTypeAny> = {};

  for (const key in shape) {
    newShape[key] = makeFieldPartial(shape[key] as any, options);
  }

  return (options?.strict === false ? z.object(newShape) : z.strictObject(newShape)) as any;
};

const makeFieldPartial = (
  fieldSchema: z.ZodTypeAny,
  options?: { strict?: boolean }
): z.ZodTypeAny => {
  const type = (fieldSchema as any)?.type ?? (fieldSchema as any)?._def?.type;

  if (type === 'object') {
    return makeDomainOverrideSchema(fieldSchema as any, options).optional();
  }
  if (type === 'array') {
    const element =
      (fieldSchema as any)?.element ??
      (fieldSchema as any)?.def?.type ??
      (fieldSchema as any)?._def?.type;
    return element
      ? z.array(makeFieldPartial(element, options)).optional()
      : fieldSchema.optional();
  }
  if (type === 'default' || type === 'prefault') {
    const inner = (fieldSchema as any)?.def?.innerType ?? (fieldSchema as any)?._def?.innerType;
    return makeFieldPartial(inner, options);
  }
  if (type === 'optional') {
    const inner = (fieldSchema as any)?.def?.innerType ?? (fieldSchema as any)?._def?.innerType;
    return makeFieldPartial(inner, options).optional();
  }
  if (type === 'nullable') {
    const inner = (fieldSchema as any)?.def?.innerType ?? (fieldSchema as any)?._def?.innerType;
    return makeFieldPartial(inner, options).nullable().optional();
  }
  if (type === 'effects' || type === 'transform') {
    const inner = (fieldSchema as any)?.def?.schema ?? (fieldSchema as any)?._def?.schema;
    return makeFieldPartial(inner, options);
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

const systemInstanceConfigDomainBaseSchemaMap = {
  site: SiteConfigSchema,
  auth: AuthConfigSchema,
  security: SecurityConfigSchema,
  feature: FeatureConfigSchema,
  commercial: CommercialConfigSchema,
  resource: ResourceConfigSchema,
  performance: PerformanceConfigBaseSchema,
  storage: StorageConfigSchema,
  vector: VectorConfigSchema,
  providers: ProvidersConfigBaseSchema,
  subservice: SubserviceConfigBaseSchema
} as const;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof RegExp);

const unwrapFieldSchema = (fieldSchema: z.ZodTypeAny): z.ZodTypeAny => {
  const type = (fieldSchema as any)?.type ?? (fieldSchema as any)?._def?.type;
  if (type === 'default' || type === 'prefault' || type === 'optional' || type === 'nullable') {
    const inner = (fieldSchema as any)?.def?.innerType ?? (fieldSchema as any)?._def?.innerType;
    return inner ? unwrapFieldSchema(inner) : fieldSchema;
  }
  if (type === 'effects' || type === 'transform') {
    const inner = (fieldSchema as any)?.def?.schema ?? (fieldSchema as any)?._def?.schema;
    return inner ? unwrapFieldSchema(inner) : fieldSchema;
  }
  return fieldSchema;
};

/**
 * 读取模式下仅按 Schema 已知字段树剥离未知/废弃字段，不做业务约束校验。
 * 这样即便同域内同时残留未知旧键与不合规旧值，读取也不会报错或丢弃待修字段，
 * 保存前合并时也始终能剔除未知旧键，避免管理员无法保存修复。
 */
const pickKnownFieldValue = (fieldSchema: z.ZodTypeAny, value: unknown): unknown => {
  if (value === null || value === undefined) return value;

  const inner = unwrapFieldSchema(fieldSchema);
  const type = (inner as any)?.type ?? (inner as any)?._def?.type;

  if (type === 'object') {
    return isPlainRecord(value)
      ? pickKnownObjectFields(inner as z.ZodObject<any>, value)
      : structuredClone(value);
  }

  if (type === 'array') {
    if (!Array.isArray(value)) return structuredClone(value);
    const element =
      (inner as any)?.element ?? (inner as any)?.def?.type ?? (inner as any)?._def?.type;
    return element
      ? value.map((item) => pickKnownFieldValue(element, item))
      : structuredClone(value);
  }

  if (type === 'pipe') {
    const parsed = inner.safeParse(value);
    return parsed.success ? parsed.data : structuredClone(value);
  }

  return structuredClone(value);
};

const pickKnownObjectFields = (
  schema: z.ZodObject<any>,
  input: unknown
): Record<string, unknown> => {
  if (!isPlainRecord(input)) return {};

  const shape = schema.shape;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    if (!Object.hasOwn(input, key) || input[key] === undefined) continue;
    output[key] = pickKnownFieldValue(shape[key], input[key]);
  }
  return output;
};

/**
 * 生效配置合成时递归补齐数组元素与嵌套子对象上缺失的 Schema 默认值，
 * 同时原样保留已存在的合法或异常字段值，不做整域抛错。
 */
const fillMissingFieldDefaults = (fieldSchema: z.ZodTypeAny, value: unknown): unknown => {
  if (value === undefined) {
    const defaultParsed = fieldSchema.safeParse(undefined);
    return defaultParsed.success ? defaultParsed.data : undefined;
  }
  if (value === null) return null;

  const inner = unwrapFieldSchema(fieldSchema);
  const type = (inner as any)?.type ?? (inner as any)?._def?.type;

  if (type === 'object') {
    return isPlainRecord(value)
      ? fillMissingObjectDefaults(inner as z.ZodObject<any>, value)
      : value;
  }

  if (type === 'array') {
    if (!Array.isArray(value)) return value;
    const element =
      (inner as any)?.element ?? (inner as any)?.def?.type ?? (inner as any)?._def?.type;
    return element ? value.map((item) => fillMissingFieldDefaults(element, item)) : value;
  }

  return value;
};

const fillMissingObjectDefaults = (
  schema: z.ZodObject<any>,
  input: Record<string, unknown>
): Record<string, unknown> => {
  const shape = schema.shape;
  const output: Record<string, unknown> = { ...input };
  for (const key of Object.keys(shape)) {
    const existing = Object.hasOwn(input, key) ? input[key] : undefined;
    const filled = fillMissingFieldDefaults(shape[key], existing);
    if (filled !== undefined) {
      output[key] = filled;
    }
  }
  return output;
};

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
 * 阶段 1 校验：校验提交的 overrides 形态与字段类型。
 * - 默认 strict 模式：拒绝未知字段与非法类型，用于 Admin 保存边界；
 * - strict: false 模式：未配置返回空对象，普通对象按已知字段树剥离未知键；
 *   非普通对象的损坏根值原样保留，避免被当成合法空配置而关闭运行时安全限制。
 */
export const parseDomainOverrides = <T extends SystemInstanceConfigDomainKey>({
  domain,
  overrides,
  options
}: {
  domain: T;
  overrides: unknown;
  options?: { strict?: boolean };
}): DeepPartial<SystemInstanceConfigDomainMap[T]> => {
  if (options?.strict === false) {
    if (overrides === undefined) {
      return {} as DeepPartial<SystemInstanceConfigDomainMap[T]>;
    }
    if (!isPlainRecord(overrides)) {
      return structuredClone(overrides) as DeepPartial<SystemInstanceConfigDomainMap[T]>;
    }
    return pickKnownObjectFields(
      systemInstanceConfigDomainBaseSchemaMap[domain],
      overrides
    ) as DeepPartial<SystemInstanceConfigDomainMap[T]>;
  }
  return systemInstanceConfigDomainOverrideSchemaMap[domain].parse(overrides ?? {}) as DeepPartial<
    SystemInstanceConfigDomainMap[T]
  >;
};

/**
 * 合成单个 Domain 的生效配置：
 * - strict: false（启动/轮询/读取）：剥离未知字段并合并默认值（含数组元素默认字段），保留损坏根值；
 * - 默认 strict（保存边界）：严格校验 overrides 形态及合并后的完整 DomainSchema。
 */
export const resolveDomainEffectiveConfig = <T extends SystemInstanceConfigDomainKey>({
  domain,
  overrides,
  options
}: {
  domain: T;
  overrides?: unknown;
  options?: { strict?: boolean };
}): SystemInstanceConfigDomainMap[T] => {
  const defaultValues = getDomainDefaultConfig(domain);
  const parsedOverrides = parseDomainOverrides({ domain, overrides, options });
  const merged = deepMergeConfig(defaultValues, parsedOverrides);
  if (options?.strict === false) {
    return (
      isPlainRecord(merged)
        ? fillMissingObjectDefaults(systemInstanceConfigDomainBaseSchemaMap[domain], merged)
        : merged
    ) as SystemInstanceConfigDomainMap[T];
  }
  return systemInstanceConfigDomainSchemaMap[domain].parse(
    merged
  ) as SystemInstanceConfigDomainMap[T];
};

/**
 * 完整运行时快照：11 个业务域及 6 个辅助 scope，读取默认值不会创建部署身份或授权。
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
  subservice: SubserviceConfigSchema.prefault({}),
  proEnv: systemInstanceConfigScopeSchemaMap.proEnv.prefault({}),
  license: systemInstanceConfigScopeSchemaMap.license
    .extend({
      // 缓存可能来自旧授权格式；非法缓存只撤销授权，保留原文供 Pro 重验，不阻塞其他 scope。
      data: RuntimeLicenseDataSchema.optional().catch(undefined)
    })
    .prefault({}),
  instanceId: z.object({ instanceId: z.string().min(1).optional() }).prefault({}),
  modelStatusProbe: systemInstanceConfigScopeSchemaMap.modelStatusProbe.prefault({}),
  moderationPolicy: systemInstanceConfigScopeSchemaMap.moderationPolicy.prefault({}),
  operations: systemInstanceConfigScopeSchemaMap.operations.prefault({})
});

export type SystemInstanceConfig = z.infer<typeof SystemInstanceConfigSchema>;

/**
 * 给定各 Domain 的 overrides 字典，合成全量生效实例配置快照。
 */
export const resolveSystemInstanceConfig = (
  domainOverridesMap: Partial<{
    [K in (typeof SYSTEM_INSTANCE_CONFIG_SCOPES)[number]]: unknown;
  }> = {},
  options?: { strict?: boolean }
): SystemInstanceConfig => {
  /** 辅助 scope 与业务域遵循同一读取边界；只有缺省字段合并默认值。 */
  const readScope = <
    K extends Exclude<SystemInstanceConfigScopeKey, SystemInstanceConfigDomainKey>
  >(
    scope: K
  ): SystemInstanceConfig[K] => {
    const schema = SystemInstanceConfigSchema.shape[scope];
    const value = domainOverridesMap[scope];
    if (options?.strict !== false) {
      return schema.parse(value) as SystemInstanceConfig[K];
    }
    const result = schema.safeParse(value);
    if (result.success) return result.data as SystemInstanceConfig[K];
    const retained = deepMergeConfig(schema.parse(undefined), value);
    if (scope === 'license' && retained && typeof retained === 'object') {
      // 授权缓存仍须遵循原有失效规则；配置容错不能恢复无效授权能力。
      const license = retained as SystemInstanceConfig['license'];
      const cache = RuntimeLicenseDataSchema.safeParse(license.data);
      return {
        ...license,
        data: cache.success ? cache.data : undefined
      } as SystemInstanceConfig[K];
    }
    return retained as SystemInstanceConfig[K];
  };
  return {
    site: resolveDomainEffectiveConfig({
      domain: 'site',
      overrides: domainOverridesMap.site,
      options
    }),
    auth: resolveDomainEffectiveConfig({
      domain: 'auth',
      overrides: domainOverridesMap.auth,
      options
    }),
    security: resolveDomainEffectiveConfig({
      domain: 'security',
      overrides: domainOverridesMap.security,
      options
    }),
    feature: resolveDomainEffectiveConfig({
      domain: 'feature',
      overrides: domainOverridesMap.feature,
      options
    }),
    commercial: resolveDomainEffectiveConfig({
      domain: 'commercial',
      overrides: domainOverridesMap.commercial,
      options
    }),
    resource: resolveDomainEffectiveConfig({
      domain: 'resource',
      overrides: domainOverridesMap.resource,
      options
    }),
    performance: resolveDomainEffectiveConfig({
      domain: 'performance',
      overrides: domainOverridesMap.performance,
      options
    }),
    storage: resolveDomainEffectiveConfig({
      domain: 'storage',
      overrides: domainOverridesMap.storage,
      options
    }),
    vector: resolveDomainEffectiveConfig({
      domain: 'vector',
      overrides: domainOverridesMap.vector,
      options
    }),
    providers: resolveDomainEffectiveConfig({
      domain: 'providers',
      overrides: domainOverridesMap.providers,
      options
    }),
    subservice: resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: domainOverridesMap.subservice,
      options
    }),
    proEnv: readScope('proEnv'),
    license: readScope('license'),
    instanceId: readScope('instanceId'),
    modelStatusProbe: readScope('modelStatusProbe'),
    moderationPolicy: readScope('moderationPolicy'),
    operations: readScope('operations')
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
  domain: SystemInstanceConfigScopeKeySchema,
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

/** 解析全量生效配置，可用于初始快照构建。 */
export const parseSystemInstanceConfig = (input: unknown): SystemInstanceConfig =>
  SystemInstanceConfigSchema.parse(input);

/** 解析单个 Domain MongoDB 文档。 */
export const parseSystemInstanceDomainDocument = (input: unknown) =>
  SystemInstanceDomainDocumentSchema.parse(input);
