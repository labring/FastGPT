/**
 * Resolve Vitest worker count for Mongo-backed suites.
 *
 * The default is based on the current Mongo-backed service suite benchmark.
 * Override with FASTGPT_TEST_MAX_WORKERS=8 on high-memory machines or when
 * repeatedly starting/stopping mongodb-memory-server in local experiments.
 */
export const getTestMaxWorkers = () => {
  const raw = process.env.FASTGPT_TEST_MAX_WORKERS;
  if (!raw) return 4;
  if (raw.endsWith('%')) return raw as `${number}%`;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
};
