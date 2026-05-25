import { createEnv } from '@t3-oss/env-core';
import z from 'zod';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

const NumSchema = z.coerce.number<number>();
const IntSchema = NumSchema.int().nonnegative();
const PositiveIntSchema = IntSchema.positive();

const BoolSchema = z
  .string()
  .transform((val) => val === 'true')
  .pipe(z.boolean());

export const trainEnv = createEnv({
  server: {
    // ===== Index Type Configuration =====
    TRAIN_INDEX_TYPE: z.enum(DatasetDataIndexTypeEnum).default(DatasetDataIndexTypeEnum.question),

    // ===== Data Sampling =====
    TRAIN_DATA_SPLIT_RATIO: NumSchema.min(0).max(1).default(0.8),
    TRAIN_MIN_CHUNK_COUNT: PositiveIntSchema.default(300),
    TRAIN_MIN_EVAL_QA_COUNT: PositiveIntSchema.default(200),

    // ===== Training Task Threshold =====
    TRAIN_MIN_TASK_CHUNK_THRESHOLD: PositiveIntSchema.default(500),

    // ===== LLM Judge Configuration =====
    LLM_JUDGE_TOP_K: PositiveIntSchema.default(10),

    // ===== DiTing Service Configuration =====
    DITING_BASE_URL: z.string().default('http://diting:3000'),
    DITING_TIMEOUT: PositiveIntSchema.default(1800000),
    DITING_CONCURRENCY: PositiveIntSchema.default(10),
    DITING_MAX_CONCURRENCY: PositiveIntSchema.default(50),
    DITING_API_CONCURRENCY: PositiveIntSchema.default(10),
    DITING_MOCK_ENABLE: BoolSchema.default(false),
    DITING_MOCK_SYNTH_FAIL: BoolSchema.default(false),

    // ===== SFT Bridge Service Configuration =====
    SFT_BRIDGE_BASE_URL: z.string().default('http://sft-bridge:3000'),
    SFT_BRIDGE_TIMEOUT: PositiveIntSchema.default(300000),
    SFT_BRIDGE_POLL_INTERVAL: PositiveIntSchema.default(60000),
    SFT_BRIDGE_MAX_POLLS: PositiveIntSchema.default(600),
    SFT_BRIDGE_LEARNING_RATE: NumSchema.positive().default(0.0001),
    SFT_BRIDGE_MOCK_ENABLE: BoolSchema.default(false),
    SFT_BRIDGE_MOCK_RERANK_FAIL: BoolSchema.default(false),
    SFT_BRIDGE_MOCK_EMBED_FAIL: BoolSchema.default(false),

    SFT_BRIDGE_MOCK_RERANK_ENDPOINT_BASE_URL: z
      .string()
      .default('http://sft-bridge:3000/Qwen3-reranker-0.6B-LORA/v1'),
    SFT_BRIDGE_MOCK_RERANK_ENDPOINT_MODEL: z.string().default('Qwen3-reranker-0.6B-LORA'),
    SFT_BRIDGE_MOCK_RERANK_ENDPOINT_API_KEY: z.string().default('sk-test'),

    SFT_BRIDGE_MOCK_EMBED_ENDPOINT_BASE_URL: z
      .string()
      .default('http://sft-bridge:3000/Qwen3-Embedding-0.6B-LoRA/v1'),
    SFT_BRIDGE_MOCK_EMBED_ENDPOINT_MODEL: z.string().default('Qwen3-Embedding-0.6B-LoRA'),
    SFT_BRIDGE_MOCK_EMBED_ENDPOINT_API_KEY: z.string().default('sk-test'),

    // ===== Evaluation Configuration =====
    TRAIN_EVAL_CONCURRENCY: PositiveIntSchema.default(20),

    // ===== Dataset Search Configuration =====
    TRAIN_SEARCH_SIMILARITY: NumSchema.min(0).max(1).default(0.1),
    TRAIN_SEARCH_LIMIT: PositiveIntSchema.default(10240),
    TRAIN_MAX_SEARCH_RUN_TIMES: PositiveIntSchema.default(50),
    TRAIN_DATASET_SEARCH_CONCURRENCY: PositiveIntSchema.default(10),

    // ===== BullMQ Worker Configuration =====
    TRAIN_WORKER_STALLED_INTERVAL: PositiveIntSchema.default(30000),
    TRAIN_JOB_BACKOFF_DELAY: PositiveIntSchema.default(5000),
    TRAIN_TASK_CONCURRENCY: PositiveIntSchema.default(1),
    TRAIN_DATA_GENERATE_CONCURRENCY: PositiveIntSchema.default(2),
    TRAIN_WORKER_MAX_STALLED_COUNT: PositiveIntSchema.default(3),

    // ===== Channel Creation Configuration =====
    TRAIN_CHANNEL_CREATE_TIMEOUT: PositiveIntSchema.default(30000),

    // ===== Channel Availability Polling Configuration =====
    TRAIN_CHANNEL_AVAILABILITY_POLL_INTERVAL: PositiveIntSchema.default(10000),
    TRAIN_CHANNEL_AVAILABILITY_MAX_DURATION: PositiveIntSchema.default(300000),

    // ===== AI Proxy Configuration =====
    AIPROXY_API_ENDPOINT: z.string().optional(),
    AIPROXY_API_TOKEN: z.string().optional(),

    // ===== Training Data Directory =====
    TRAIN_DATA_DIR: z.string().optional()
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid train environment variables. Please check: ${paths}\n`);
  }
});
