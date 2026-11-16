import z from 'zod';
import { ProEnvConfigSchema } from './proEnv';
import { ModelStatusProbeConfigSchema } from './modelStatus';
import {
  DefaultSystemModerationPolicy,
  SystemModerationPolicySchema
} from '../../../core/plugin/moderation/type';

/** 运营内容按独立子对象保存，局部更新不得覆盖同域其他公告或广告。 */
export const SystemMsgModalConfigSchema = z.looseObject({
  id: z.string().default(''),
  content: z.string().default('')
});
export const OperationalAdConfigSchema = z.looseObject({
  id: z.string().default(''),
  operationalAdImage: z.string().default(''),
  operationalAdLink: z.string().default('')
});
export const ActivityAdConfigSchema = z.looseObject({
  id: z.string().default(''),
  activityAdImage: z.string().default(''),
  activityAdLink: z.string().default('')
});
export const OperationsConfigSchema = z.strictObject({
  systemMsgModal: SystemMsgModalConfigSchema.optional(),
  operationalAd: OperationalAdConfigSchema.optional(),
  activityAd: ActivityAdConfigSchema.optional()
});

/**
 * 辅助系统 scope 的持久化合约，与 11 个管理表单业务域分开。
 * License 缓存保留历史字段和授权版本，由 Pro 验签归一化，存储迁移不改变授权语义。
 */
export const systemInstanceConfigScopeSchemaMap = {
  proEnv: ProEnvConfigSchema,
  license: z.looseObject({
    license: z.string().optional(),
    data: z.looseObject({}).optional()
  }),
  instanceId: z.looseObject({ instanceId: z.string().min(1) }),
  modelStatusProbe: ModelStatusProbeConfigSchema,
  moderationPolicy: z.preprocess(
    (value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? { ...DefaultSystemModerationPolicy, ...value }
        : value,
    SystemModerationPolicySchema.passthrough()
  ),
  operations: OperationsConfigSchema
};
