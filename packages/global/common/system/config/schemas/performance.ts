import z from 'zod';
import { nonNegativeInteger, positiveInteger } from './primitives';

const WorkflowPerformanceConfigSchema = z.strictObject({
  // 旧 env IntSchema 允许 0 且 0 直达消费点：maxRunTimes<=0 立即停止工作流、
  // maxLoopTimes=0 拒绝任何循环输入，属"禁用"语义；放宽以保持迁移前后行为一致
  maxRunTimes: nonNegativeInteger(500),
  maxLoopTimes: nonNegativeInteger(100),
  parallelMaxConcurrency: positiveInteger(10)
});

const ParsePerformanceConfigSchema = z.strictObject({
  fileTimeoutSeconds: z.number().int().min(60).max(6000).default(600),
  xlsxMaxRows: z.number().int().min(1).max(1_048_576).default(100_000),
  xlsxMaxColumns: z.number().int().min(1).max(16_384).default(1000),
  xlsxMaxCells: positiveInteger(1_000_000),
  xlsxMaxMergedCells: positiveInteger(1_000_000),
  // 0 在旧 env 已合法传入 parse worker（表示不做 HTML 截断变换），保持兼容
  maxHtmlTransformChars: nonNegativeInteger(1_000_000)
});

const DatasetPerformanceConfigSchema = z.strictObject({
  parseMaxProcess: positiveInteger(10),
  vectorMaxProcess: positiveInteger(10),
  qaMaxProcess: positiveInteger(10),
  vlmMaxProcess: positiveInteger(10),
  retrievalResultsLimit: nonNegativeInteger(0)
});

const ChatPerformanceConfigSchema = z.strictObject({
  // 消费点 getLimitData 对 falsy qpm 直接放行（if (!qpm) return），0 = 不限流
  maxQpm: nonNegativeInteger(5000)
});

const StreamResumePerformanceConfigSchema = z.strictObject({
  ttlSeconds: positiveInteger(5 * 60),
  postCompleteTtlSeconds: positiveInteger(30),
  redisMaxmemoryRatio: z.number().gt(0).lte(1).default(0.5),
  redisMemoryCheckIntervalMs: positiveInteger(5000)
});

const TrackingPerformanceConfigSchema = z.strictObject({
  batchUpdateTime: positiveInteger(10_000),
  retentionHours: positiveInteger(6)
});

export const PerformanceConfigBaseSchema = z.strictObject({
  workflow: WorkflowPerformanceConfigSchema.prefault({}),
  parse: ParsePerformanceConfigSchema.prefault({}),
  dataset: DatasetPerformanceConfigSchema.prefault({}),
  chat: ChatPerformanceConfigSchema.prefault({}),
  streamResume: StreamResumePerformanceConfigSchema.prefault({}),
  tracking: TrackingPerformanceConfigSchema.prefault({}),
  // BullMQ concurrency=0 为合法取值（暂停消费），与旧 env nonnegative 语义一致
  task: z.strictObject({ evalConcurrency: nonNegativeInteger(3) }).prefault({}),
  channel: z.strictObject({ wechatConcurrency: positiveInteger(1000) }).prefault({})
});

export const PerformanceConfigSchema = PerformanceConfigBaseSchema.superRefine(
  (performance, ctx) => {
    // maxLoopTimes=0 表示禁用循环节点，此时并行约束无意义；
    // 不跳过会让"0=禁用"在并行默认值 10 存在时把整个 performance 域判为非法
    if (
      performance.workflow.maxLoopTimes > 0 &&
      performance.workflow.parallelMaxConcurrency > performance.workflow.maxLoopTimes
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['workflow', 'parallelMaxConcurrency'],
        message: 'parallelMaxConcurrency cannot exceed maxLoopTimes'
      });
    }
  }
);
