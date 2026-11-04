import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** 前置材料不足与产品断言失败分开记录；该错误不代表业务已执行。 */
export class Blocked extends Error {}

/** 只读取显式提供的隔离测试清单，不发现环境凭证或借用共享应用。 */
export async function loadFixture() {
  if (!process.env.FASTGPT_TEST_FIXTURE)
    throw new Blocked('需要 FASTGPT_TEST_FIXTURE 指向仓库外的测试配置');
  let fixture;
  try {
    fixture = JSON.parse(await readFile(process.env.FASTGPT_TEST_FIXTURE, 'utf8'));
  } catch (error) {
    throw new Blocked('FASTGPT_TEST_FIXTURE 无法读取或解析：' + error.name);
  }
  if (fixture.version !== 1 || fixture.isolated !== true)
    throw new Blocked('测试配置需 version=1、isolated=true，资源仅供本轮测试');
  if (fixture.baseUrl?.replace(/\/$/, '') !== process.env.FASTGPT_TEST_BASE_URL?.replace(/\/$/, ''))
    throw new Blocked('配置 baseUrl 与报告目标不一致');
  if (!/^[0-9a-f]{24}$/i.test(fixture.teamId ?? ''))
    throw new Blocked('teamId 必须为测试团队实际 ObjectId');
  return fixture;
}

/** Node 脚本统一写报告协议；未选场景不执行，清理失败使本轮成功结果降为阻塞。 */
export async function runNodeCase(caseId, handlers) {
  const ids = JSON.parse(process.env.FASTGPT_TEST_ITEMS ?? '[]');
  assert.equal(process.env.FASTGPT_TEST_CASE_ID, caseId, '通过 test:cases 入口运行');
  assert.ok(
    ids.length &&
      new Set(ids).size === ids.length &&
      ids.every((id) => Object.hasOwn(handlers, id)),
    '选中场景无效'
  );
  const directory = process.env.FASTGPT_TEST_RUN_DIR;
  const resultFile = process.env.FASTGPT_TEST_RESULTS_FILE;
  assert.ok(
    directory && resultFile && path.dirname(path.resolve(resultFile)) === path.resolve(directory),
    '结果必须写入本次证据目录'
  );
  await mkdir(directory, { recursive: true });
  const results = [];
  let fixture, initialError;
  try {
    fixture = await loadFixture();
  } catch (error) {
    initialError = error;
  }
  const shared = {
    fixture,
    run: 'fgtest-' + randomUUID(),
    finalizers: [],
    cleanups: [],
    resources: new Map(),
    secrets: new Set(),
    directory
  };
  const { sanitize } = await import('./scenario.mjs');
  for (const itemId of ids) {
    const observations = [],
      attachments = [],
      itemFinalizers = [];
    let result = 'passed',
      note;
    try {
      if (initialError) throw initialError;
      note = await handlers[itemId]({
        ...shared,
        itemId,
        observations,
        attachments,
        itemFinalizers
      });
      assert.ok(observations.length, '通过判定必须有本次响应或数据证据');
    } catch (error) {
      result = error instanceof Blocked ? 'blocked' : 'failed';
      note = `${error.name}: ${error.message}`;
    }
    // 业务任务逐项收尾；共享连接留到整份用例结束，失败不能污染下一个场景。
    const itemCleanupErrors = [];
    for (const cleanup of itemFinalizers.reverse())
      try {
        await cleanup();
      } catch (error) {
        itemCleanupErrors.push({ name: error.name, message: error.message });
      }
    if (itemCleanupErrors.length) {
      observations.push({ label: '子场景收尾失败', value: itemCleanupErrors });
      if (result === 'passed') result = 'blocked';
      note += '；本项收尾未完成';
    }
    const evidence = `${itemId}-evidence.json`;
    note = sanitize(note, shared.secrets);
    await writeFile(
      path.join(directory, evidence),
      JSON.stringify(
        sanitize({ caseId, itemId, result, note, observations }, shared.secrets),
        null,
        2
      )
    );
    results.push({
      caseId,
      itemId,
      result,
      note,
      evidence: [{ path: evidence, label: '实际请求与数据核对' }, ...attachments]
    });
  }
  const cleanupResults = [],
    cleanupErrors = [];
  // 先放行/收尾 gate 请求，再删除对话，最后关闭连接；单项清理失败仍继续尝试其余项。
  for (const cleanup of [...shared.finalizers.reverse(), ...shared.cleanups.reverse()]) {
    try {
      const result = await cleanup();
      if (result) cleanupResults.push(result);
    } catch (error) {
      cleanupErrors.push({ error: error.name, message: error.message });
    }
  }
  await writeFile(
    path.join(directory, 'cleanup.json'),
    JSON.stringify(
      sanitize({ results: cleanupResults, errors: cleanupErrors }, shared.secrets),
      null,
      2
    )
  );
  for (const row of results) row.evidence.push({ path: 'cleanup.json', label: '本轮清理结果' });
  if (cleanupErrors.length) {
    for (const row of results) {
      if (row.result === 'passed') row.result = 'blocked';
      row.note += '；清理未完成，见清理证据';
    }
  }
  await writeFile(resultFile, JSON.stringify(results, null, 2));
  if (results.some((row) => row.result !== 'passed')) process.exitCode = 1;
}
