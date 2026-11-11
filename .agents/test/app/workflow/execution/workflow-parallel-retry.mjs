import assert from 'node:assert/strict';

/** 共享并行重试验收：区分尝试错误、最终任务状态、变量提交和消费者结果。 */
export async function verifyParallelRetry(c) {
  for (const retries of [1, 0]) {
    const graph = await c.load('parallel-retry');
    graph.nodes
      .find((node) => node.nodeId === 'Container')
      .inputs.find((input) => input.key === 'parallelRunMaxRetryTimes').value = retries;
    const runId = `${c.run}-retry-${retries}`;
    graph.nodes
      .find((node) => node.nodeId === 'Attempt')
      .inputs.find((input) => input.key === 'system_httpJsonBody').value = JSON.stringify({
      runId,
      index: 0
    });
    const appId = await c.create(`parallel-retry-${retries}`, graph);
    const result = await c.complete(appId, { chatId: runId, stream: true });
    // 失败 attempt 的详情必须保留；不能把历史 errorText 当成 SSE 根错误。
    assert.equal(result.http, 200);
    assert.equal(result.done, true);
    assert.ok(!result.events.some((event) => event.event === 'error'));
    const stored = await c.persisted(appId, runId);
    const values = stored.chats[0].variables;
    assert.equal(values.a, retries ? 'retry-ok' : 'A0', '失败尝试不得提交 failed');
    assert.equal(values.b, 'B1', '独立成功任务不得被重试旧快照覆盖');
    const attempts = (await c.gateObservations()).filter(
      (entry) => entry.path === '/attempt' && entry.body.runId === runId
    );
    assert.equal(attempts.length, retries + 1);
    const parallel = stored.rows.find((row) => row.data.nodeId === 'Container').data;
    assert.equal(parallel.parallelRunDetail.length, 2);
    assert.equal(parallel.parallelRunDetail[0].success, Boolean(retries));
    assert.equal(parallel.parallelRunDetail[1].success, true);
    const failedAttempt = stored.rows.find(
      (row) => row.data.nodeId === 'Attempt' && row.data.errorText
    )?.data;
    assert.ok(failedAttempt, '首次失败必须保留节点详情');
    const failedWrapper = stored.rows.find((row) => row.data.id === failedAttempt.parentId)?.data;
    assert.ok(failedWrapper, '失败详情必须归属于对应任务尝试');
    assert.equal(failedWrapper.errorCaptured === true, Boolean(retries));
    assert.equal(stored.chats[0].errorCount, retries ? 0 : 1);
    if (retries) assert.equal(parallel.errorText, undefined);
    const expected = `a=${values.a}|b=B1|stamp=S0|n=9|flag=true|text=seed`;
    assert.equal(
      stored.rows.find((row) => row.data.nodeId === 'ReadVariables')?.data.textOutput,
      expected
    );
    assert.equal(result.text.trim(), expected);
    c.record('真实并行重试对照', {
      retries,
      attempts,
      values,
      parallel,
      failedAttempt,
      failedWrapper
    });
  }
  return '真实 HTTP 首次 503/再次成功；一次重试提交 retry-ok，零重试保留 A0，两者均保留 B1 和失败尝试详情。';
}
