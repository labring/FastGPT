import z from 'zod';

/**
 * 模型探测健康状态枚举：
 * - green: 正常响应且延迟在合理范围内（<= 30s）
 * - yellow: 调用成功但响应时间过长（> 30s）
 * - red: 连续 4 次重试均失败，模型不可用
 */
export enum ModelStatusProbeStatusEnum {
  green = 'green',
  yellow = 'yellow',
  red = 'red'
}

/** 模型探测状态 Zod Schema */
export const ModelStatusProbeStatusSchema = z.enum([
  ModelStatusProbeStatusEnum.green,
  ModelStatusProbeStatusEnum.yellow,
  ModelStatusProbeStatusEnum.red
]);

/** 模型探测健康状态联合类型 */
export type ModelStatusProbeStatus = z.infer<typeof ModelStatusProbeStatusSchema>;
