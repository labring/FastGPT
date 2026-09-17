import z from 'zod';
import { positiveInteger, urlWithDefault } from './primitives';

const WorkflowPerformanceConfigSchema = z.strictObject({
  maxRunTimes: positiveInteger(500),
  maxLoopTimes: positiveInteger(100),
  parallelMaxConcurrency: positiveInteger(10)
});

const ParsePerformanceConfigSchema = z.strictObject({
  fileTimeoutSeconds: z.number().int().min(60).max(6000).default(600),
  xlsxMaxRows: z.number().int().min(1).max(1_048_576).default(100_000),
  xlsxMaxColumns: z.number().int().min(1).max(16_384).default(1000),
  xlsxMaxCells: positiveInteger(1_000_000),
  xlsxMaxMergedCells: positiveInteger(1_000_000),
  maxHtmlTransformChars: positiveInteger(1_000_000)
});

const DatasetPerformanceConfigSchema = z.strictObject({
  parseMaxProcess: positiveInteger(10),
  vectorMaxProcess: positiveInteger(10),
  qaMaxProcess: positiveInteger(10),
  vlmMaxProcess: positiveInteger(10)
});

const ChatPerformanceConfigSchema = z.strictObject({
  maxQpm: positiveInteger(5000),
  logUrl: urlWithDefault(),
  logInterval: z.number().int().positive().nullable().default(null),
  logSourceIdPrefix: z.string().max(100).default('fastgpt-')
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

export const PerformanceConfigSchema = z.strictObject({
  workflow: WorkflowPerformanceConfigSchema.prefault({}),
  parse: ParsePerformanceConfigSchema.prefault({}),
  dataset: DatasetPerformanceConfigSchema.prefault({}),
  chat: ChatPerformanceConfigSchema.prefault({}),
  streamResume: StreamResumePerformanceConfigSchema.prefault({}),
  tracking: TrackingPerformanceConfigSchema.prefault({}),
  task: z.strictObject({ evalConcurrency: positiveInteger(3) }).prefault({}),
  channel: z.strictObject({ wechatConcurrency: positiveInteger(1000) }).prefault({})
});
