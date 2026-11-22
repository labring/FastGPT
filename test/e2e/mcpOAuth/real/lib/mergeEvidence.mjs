/**
 * 汇总两个阶段（CIMD / DCR）的证据，并把 AS 边界日志压缩成计数摘要。
 *
 * 用法：node mergeEvidence.mjs <cimd.json> <dcr.json> <out.json> <as-proxy.log>
 * 只输出计数与状态码分布，不包含任何 query/header/body。
 */
import fs from 'node:fs';

const [cimdPath, dcrPath, outPath, asLogPath] = process.argv.slice(2);
if (!cimdPath || !dcrPath || !outPath) {
  console.error('usage: mergeEvidence.mjs <cimd.json> <dcr.json> <out.json> [as-proxy.log]');
  process.exit(2);
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const cimd = readJson(cimdPath);
const dcr = readJson(dcrPath);
const phases = [cimd, dcr].filter(Boolean);

const asLog = (() => {
  if (!asLogPath || !fs.existsSync(asLogPath)) return [];
  return fs
    .readFileSync(asLogPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
})();

const endpoints = {};
for (const entry of asLog) {
  const key = `${entry.method} ${entry.path}${entry.grantType ? ` (${entry.grantType})` : ''}`;
  endpoints[key] ??= { count: 0, statuses: {} };
  endpoints[key].count += 1;
  endpoints[key].statuses[entry.status] ??= 0;
  endpoints[key].statuses[entry.status] += 1;
}

const summary = {
  ...(cimd ?? {}),
  schemaVersion: 1,
  design: 'mcp-oauth-v2.4',
  mode: 'real-as',
  phases: phases.map((phase) => ({
    phase: phase.phase,
    fastgpt: phase.topology?.fastgpt,
    feDomain: phase.topology?.feDomain,
    cases: phase.summary?.cases ?? 0,
    assertions: phase.summary?.assertions ?? 0,
    passed: phase.summary?.passed ?? 0,
    failed: phase.summary?.failed ?? 0
  })),
  summary: {
    cases: phases.reduce((sum, phase) => sum + (phase.summary?.cases ?? 0), 0),
    assertions: phases.reduce((sum, phase) => sum + (phase.summary?.assertions ?? 0), 0),
    passed: phases.reduce((sum, phase) => sum + (phase.summary?.passed ?? 0), 0),
    failed: phases.reduce((sum, phase) => sum + (phase.summary?.failed ?? 0), 0)
  },
  asBoundary: {
    note: 'Collected by the test proxy on 109; the AS process on 106 is untouched.',
    totalRequests: asLog.length,
    endpoints
  },
  evidenceFiles: { cimd: cimdPath, dcr: dcrPath }
};

fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

const lines = [
  `real-as E2E: cases=${summary.summary.cases} assertions=${summary.summary.assertions} ` +
    `passed=${summary.summary.passed} failed=${summary.summary.failed}`,
  ...phases.map(
    (phase) =>
      `  phase=${phase.phase} cases=${phase.summary?.cases ?? 0} ` +
      `assertions=${phase.summary?.assertions ?? 0} failed=${phase.summary?.failed ?? 0}`
  ),
  'AS boundary requests:',
  ...Object.entries(endpoints)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `  ${key}: ${value.count} ${JSON.stringify(value.statuses)}`),
  `evidence: ${outPath}`
];
console.log(lines.join('\n'));

process.exit(summary.summary.failed > 0 ? 1 : 0);
