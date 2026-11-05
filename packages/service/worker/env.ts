import { createEnv } from '@t3-oss/env-core';
import z from 'zod';

const IntSchema = z.coerce.number<number>().int().nonnegative();

export const workerEnv = createEnv({
  server: {
    MAX_HTML_TRANSFORM_CHARS: IntSchema.default(1000000),
    XLSX_PARSE_MAX_ROWS: IntSchema.min(1).max(1_048_576).default(100_000),
    XLSX_PARSE_MAX_COLUMNS: IntSchema.min(1).max(16_384).default(1_000),
    XLSX_PARSE_MAX_CELLS: IntSchema.min(1).max(Number.MAX_SAFE_INTEGER).default(1_000_000),
    XLSX_PARSE_MAX_MERGED_CELLS: IntSchema.min(1).max(Number.MAX_SAFE_INTEGER).default(1_000_000),
    LITEPARSE_OCR_SERVER_URL: z.string().url().optional(),
    LITEPARSE_OCR_SERVER_KEY: z.string().optional(),
    LITEPARSE_OCR_LANGUAGE: z.string().min(1).default('eng'),
    LITEPARSE_OCR_TIMEOUT_MS: IntSchema.min(1000).default(120_000)
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env
});
