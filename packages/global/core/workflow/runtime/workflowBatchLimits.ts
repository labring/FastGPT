/**
 * 批量并行数：与 packages/service/env.ts 中 WORKFLOW_BATCH_MAX_CONCURRENCY、
 * WORKFLOW_MAX_LOOP_TIMES 及 next.config 注入的 NEXT_PUBLIC_* 保持一致。
 * 编辑器实际上限 = min(批量并发 env, 循环次数上限)。
 */
export const WORKFLOW_BATCH_MIN_CONCURRENCY = 5;
export const WORKFLOW_BATCH_MAX_CONCURRENCY_FALLBACK = 10;
export const WORKFLOW_MAX_LOOP_TIMES_FALLBACK = 100;

function readIntEnv(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? n : undefined;
}

/** 与 WORKFLOW_BATCH_MAX_CONCURRENCY 对齐（Next 注入为 NEXT_PUBLIC_*） */
export function getWorkflowBatchMaxConcurrencyCap(): number {
  const n = readIntEnv(
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_WORKFLOW_BATCH_MAX_CONCURRENCY : ''
  );
  if (n === undefined || n < WORKFLOW_BATCH_MIN_CONCURRENCY) {
    return WORKFLOW_BATCH_MAX_CONCURRENCY_FALLBACK;
  }
  return n;
}

/** 与 WORKFLOW_MAX_LOOP_TIMES 对齐（Next 注入为 NEXT_PUBLIC_*） */
export function getWorkflowMaxLoopTimesCap(): number {
  const n = readIntEnv(
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_WORKFLOW_MAX_LOOP_TIMES : ''
  );
  if (n === undefined || n < WORKFLOW_BATCH_MIN_CONCURRENCY) {
    return WORKFLOW_MAX_LOOP_TIMES_FALLBACK;
  }
  return n;
}

/** 画布上 batch 并行数字段的 max，须与 runBatch getRuntimeConcurrency 上界一致 */
export function getWorkflowBatchConcurrencyEditorMax(): number {
  return Math.min(getWorkflowBatchMaxConcurrencyCap(), getWorkflowMaxLoopTimesCap());
}
