import z from 'zod';
import { ProEnvConfigSchema } from './proEnv';
import { SubPlanInputSchema } from '../../../support/wallet/sub/type';
import { LangfuseConfigSchema } from '../types';
import { ModelStatusProbeConfigSchema } from './modelStatus';
import {
  DefaultSystemModerationPolicy,
  SystemModerationPolicySchema
} from '../../../core/plugin/moderation/type';

/**
 * 辅助系统 scope 的持久化合约，与 11 个管理表单业务域分开。
 * License 缓存保留历史字段和授权版本，由 Pro 验签归一化，存储迁移不改变授权语义。
 */
export const systemInstanceConfigScopeSchemaMap = {
  proEnv: ProEnvConfigSchema,
  subPlans: SubPlanInputSchema,
  langfuse: LangfuseConfigSchema,
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
  systemMsgModal: z.looseObject({ id: z.string().default(''), content: z.string().default('') }),
  operationalAd: z.looseObject({
    id: z.string().default(''),
    operationalAdImage: z.string().default(''),
    operationalAdLink: z.string().default('')
  }),
  activityAd: z.looseObject({
    id: z.string().default(''),
    activityAdImage: z.string().default(''),
    activityAdLink: z.string().default('')
  })
};
