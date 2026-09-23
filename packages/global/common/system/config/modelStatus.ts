import { IntSchema } from '../../zod';
import z from 'zod';

/**
 * 模型健康状态探测系统配置 Schema。
 * 存储在 MongoSystemConfigs 中，key 为 SystemConfigsTypeEnum.modelStatusProbe。
 */
export const ModelStatusProbeConfigSchema = z.object({
  /** 是否开启所有模型定时自动探测 */
  enabled: z.boolean().default(false),
  /** 探测执行周期（分钟），取值范围 5 ~ 60 分钟 */
  intervalMinutes: IntSchema.min(5).max(60).default(5),
  /** 告警接收的 Webhook 回调地址（可选） */
  webhookUrl: z.string().url().max(2048).optional(),
  /** 告警请求头中携带的鉴权 Bearer Token（可选，持久化存储但前端脱敏） */
  webhookToken: z.string().max(2048).optional()
});

/** 模型状态探测系统配置类型 */
export type ModelStatusProbeConfig = z.infer<typeof ModelStatusProbeConfigSchema>;

/** 模型探测系统默认配置：默认关闭，探测间隔 5 分钟 */
export const ModelStatusProbeConfigDefaults: ModelStatusProbeConfig = {
  enabled: false,
  intervalMinutes: 5
};
