import z from 'zod';
import { IntSchema, NumSchema } from '../../../common/zod';

/**
 * AIProxy 中支持 map_reasoning_to_reasoning_content 响应字段重写的上游渠道协议 ID (ChannelProviderType)：
 * - 1: OpenAI
 */
export const REASONING_FIELD_MAPPING_CHANNEL_TYPES = [1] as const;

export enum ChannelStatusEnum {
  ChannelStatusUnknown = 0,
  ChannelStatusEnabled = 1,
  ChannelStatusDisabled = 2,
  ChannelStatusAutoDisabled = 3
}

export const ChannelManualStatusSchema = z.union([z.literal(1), z.literal(2)]);
export type ChannelStatusType = z.infer<typeof ChannelManualStatusSchema>;

export const ChannelStatusMap = {
  [ChannelStatusEnum.ChannelStatusUnknown]: {
    label: 'config_model:channel_status_unknown',
    colorSchema: 'gray'
  },
  [ChannelStatusEnum.ChannelStatusEnabled]: {
    label: 'config_model:channel_status_enabled',
    colorSchema: 'green'
  },
  [ChannelStatusEnum.ChannelStatusDisabled]: {
    label: 'config_model:channel_status_disabled',
    colorSchema: 'red'
  },
  [ChannelStatusEnum.ChannelStatusAutoDisabled]: {
    label: 'config_model:channel_status_auto_disabled',
    colorSchema: 'gray'
  }
} as const;

export const ChannelConfigSchema = z.object({
  name: z.string().meta({ description: '渠道名' }),
  type: IntSchema.meta({ description: '提供商类型（如 1=openai、14=anthropic、36=deepseek）' }),
  key: z.string().meta({ description: 'aiproxy 原生 API Key 凭证' }),
  base_url: z.string().optional().meta({ description: '自定义端点覆盖' }),
  models: z
    .array(z.string())
    .meta({ description: '渠道服务的上游模型名（与模型 model 字段匹配）' }),
  model_mapping: z
    .record(z.string(), z.string())
    .optional()
    .meta({ description: '公共名 → 上游实际名映射' }),
  priority: IntSchema.optional().meta({ description: '负载均衡权重，默认 10' }),
  status: ChannelManualStatusSchema.optional().meta({ description: '1=启用 / 2=禁用' }),
  sets: z.array(z.string()).optional().meta({ description: '模型集合，默认 default' }),
  configs: z.record(z.string(), z.unknown()).optional().meta({ description: '提供商额外配置' })
});
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

/** 表单读取结构保留运行状态；写入时仅允许手动启用/停用，自动禁用状态由 Proxy 管理。 */
export const ChannelInfoSchema = ChannelConfigSchema.extend({
  id: IntSchema,
  status: z.enum(ChannelStatusEnum),
  created_at: NumSchema.optional()
});
export type ChannelInfoType = z.infer<typeof ChannelInfoSchema>;

export const defaultChannel: ChannelInfoType = {
  id: 0,
  status: ChannelStatusEnum.ChannelStatusEnabled,
  type: 1,
  created_at: 0,
  models: [],
  model_mapping: {},
  key: '',
  name: '',
  base_url: '',
  priority: 1
};
