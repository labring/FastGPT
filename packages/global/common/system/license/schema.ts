/**
 * License 数据结构单一来源（决策版）— zod schema + 类型派生。
 *
 * 职责（方案 A）：
 * - 字段名 / 枚举 / 键清单的唯一权威，签发侧（license-server）与验证侧（normalize）共享，
 *   杜绝两侧字段漂移（历史上 version vs licenseType 已漂移一次）
 * - 签发侧用 licensePayloadSchema（严格：functions 必填全字段，默认关语义在 UI 层）
 * - 验证侧只用这里的类型 + 键清单，宽容归一化在 normalize 模块（zod 不适合表达旧→新多分支映射）
 *
 * 决策版结构（飞书决策版 §2）：
 *   { schemaVersion: 1|2, licenseType: trial|official, company, startTime, expiredTime,
 *     instanceId?, description?, limits{maxUsers,maxApps,maxDatasets}, functions{7 项} }
 *   有效期 startTime <= now < expiredTime
 */
import { z } from 'zod';

/** License schema 版本：1 = 旧结构（存量），2 = 决策版（新签发） */
export const LicenseSchemaVersionSchema = z.union([z.literal(1), z.literal(2)]);
export type LicenseSchemaVersionType = z.infer<typeof LicenseSchemaVersionSchema>;

/** 授权类型 */
export const LicenseTypeSchema = z.enum(['trial', 'official']);
export type LicenseType = z.infer<typeof LicenseTypeSchema>;

/** functions 键清单（决策版 7 项，全部显式签发） */
export const licenseFunctionKeys = [
  'sso',
  'pay',
  'eval',
  'datasetEnhance',
  'assistantGenerate',
  'portal',
  'sandboxSkills'
] as const;
export type LicenseFunctionKey = (typeof licenseFunctionKeys)[number];

/** limits 键清单 */
export const licenseLimitsKeys = ['maxUsers', 'maxApps', 'maxDatasets'] as const;
export type LicenseLimitsKey = (typeof licenseLimitsKeys)[number];

/** functions：布尔开关，决策版要求签发时显式全部给出（默认关在 UI 层，非 schema 默认）。
 *  strictObject：拒绝未知键（防旧字段 customTemplates/batchEval 混入新 license） */
export const LicenseFunctionsSchema = z.strictObject({
  sso: z.boolean(),
  pay: z.boolean(),
  eval: z.boolean(),
  datasetEnhance: z.boolean(),
  assistantGenerate: z.boolean(),
  portal: z.boolean(),
  sandboxSkills: z.boolean()
});
export type LicenseFunctions = z.infer<typeof LicenseFunctionsSchema>;

/** limits：配额，0 = 不限制。strictObject：拒绝未知配额键 */
export const LicenseLimitsSchema = z.strictObject({
  maxUsers: z.number().int().min(0),
  maxApps: z.number().int().min(0),
  maxDatasets: z.number().int().min(0)
});
export type LicenseLimits = z.infer<typeof LicenseLimitsSchema>;

/**
 * 决策版 License payload（签发侧严格校验用）。
 * - instanceId：32 位 hex，绑定部署实例（决策版 §3）
 * - 不做 startTime/expiredTime 顺序校验的 default —— 由调用方 superRefine（签发服务）与
 *   验证侧 isLicenseExpired 各自处理
 */
export const LicensePayloadSchema = z.object({
  schemaVersion: LicenseSchemaVersionSchema.default(2),
  licenseType: LicenseTypeSchema.default('official'),
  company: z.string().min(1),
  description: z.string().optional(),
  startTime: z.iso.datetime(),
  expiredTime: z.iso.datetime(),
  instanceId: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  limits: LicenseLimitsSchema,
  functions: LicenseFunctionsSchema
});
export type LicensePayload = z.infer<typeof LicensePayloadSchema>;

/** 签发侧强制未知键拒绝（决策版：customTemplates/networkIds 不入新 license） */
export const StrictLicensePayloadSchema = z.strictObject({
  ...LicensePayloadSchema.shape
});
