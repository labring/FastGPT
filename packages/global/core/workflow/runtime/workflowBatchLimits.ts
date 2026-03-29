/**
 * 批量并行「并行数」编辑器上限，需与 packages/service/env.ts 中
 * WORKFLOW_BATCH_MAX_CONCURRENCY 的语义一致。
 * 客户端通过 Next `next.config` 将 WORKFLOW_BATCH_MAX_CONCURRENCY 注入为
 * NEXT_PUBLIC_WORKFLOW_BATCH_MAX_CONCURRENCY。
 */
export const WORKFLOW_BATCH_MAX_CONCURRENCY_FALLBACK = 10;

export function getWorkflowBatchMaxConcurrencyCap(): number {
  const raw =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_WORKFLOW_BATCH_MAX_CONCURRENCY : '';
  if (raw === undefined || raw === '') return WORKFLOW_BATCH_MAX_CONCURRENCY_FALLBACK;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return WORKFLOW_BATCH_MAX_CONCURRENCY_FALLBACK;
  return n;
}
