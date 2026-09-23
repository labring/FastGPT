import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelStatusProbeStatus } from '@fastgpt/global/core/ai/model/status';

/**
 * 数据库中存储的模型探测记录结构。
 * 每次对单个模型执行健康探测后持久化一条记录，保留历史用于绘制 48 小时状态时间线。
 */
export type ModelStatusProbeRecordType = {
  _id?: string;
  /** 模型在系统模型配置中的全局唯一 ID */
  modelId: string;
  /** 模型展示名称 */
  name: string;
  /** 模型调用标识 */
  model: string;
  /** 供应商标识 */
  provider: string;
  /** 模型类型 (llm, embedding, tts, stt, rerank) */
  type: `${ModelTypeEnum}`;
  /** 探测健康状态 (green=正常, yellow=延迟过高, red=异常) */
  status: ModelStatusProbeStatus;
  /** 响应延迟（毫秒），失败时通常为空 */
  latencyMs?: number;
  /** 本轮探测实际尝试次数（1~4） */
  attempts: number;
  /** 探测失败时的具体错误文本，仅在 red 状态时记录 */
  error?: string;
  /** 单模型探测任务开始时间，包含重试等待 */
  startedAt: Date;
  /** 最后一次模型请求的开始时间 */
  requestStartedAt: Date;
  /** 最后一次模型请求完成时间，也是状态记录的排序时间 */
  requestEndedAt: Date;
};
