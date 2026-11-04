(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FastGPTTestRun = factory();
})(globalThis, function () {
  const labels = {
    pending: '待执行',
    running: '执行中',
    passed: '通过',
    failed: '失败',
    blocked: '阻塞',
    skipped: '跳过'
  };

  /** 汇总只包含本轮选中的场景；存在跳过、阻塞或未完成项时不能整体通过。 */
  function summarize(items) {
    const selected = items.filter((item) => item.selected);
    const counts = Object.fromEntries(Object.keys(labels).map((key) => [key, 0]));
    selected.forEach((item) => (counts[item.result] += 1));
    const result = ['failed', 'running', 'blocked', 'pending', 'skipped'].find(
      (key) => counts[key] > 0
    );
    return {
      result: result ?? (selected.length ? 'passed' : 'skipped'),
      total: selected.length,
      excluded: items.length - selected.length,
      counts
    };
  }

  /** 逐项追加执行事件，复测必须重新进入 running，保留先前失败和每次尝试的证据。 */
  function updateItem(run, record, now) {
    if (run.closedAt) throw new Error('报告已结束；新一轮测试请创建新报告');
    const testCase = run.cases.find((entry) => entry.id === record.caseId);
    const item = testCase?.items.find((entry) => entry.id === record.itemId);
    if (!item || !item.selected) throw new Error('只能更新本轮选中的用例/子场景');
    if (!Object.hasOwn(labels, record.result) || record.result === 'pending')
      throw new Error('结果必须为 running/passed/failed/blocked/skipped');
    if (typeof record.note !== 'string' || !record.note.trim()) throw new Error('必须填写结果说明');
    if (
      ['passed', 'failed', 'blocked', 'skipped'].includes(item.result) &&
      record.result !== item.result &&
      record.result !== 'running'
    )
      throw new Error('已有终态不能直接改写；需先 running 开始复测，保留原结果');
    const evidence = record.evidence ?? [];
    if (!Array.isArray(evidence)) throw new Error('evidence 必须为数组');
    if (['running', 'passed', 'failed'].includes(record.result) && testCase.status !== 'ready')
      throw new Error('草稿或废弃用例不能执行；先完善定义，再新建报告');
    if (['passed', 'failed'].includes(record.result)) {
      if (item.result !== 'running') throw new Error('判定前必须先标记 running；复测同样如此');
      if (!evidence.length) throw new Error('通过/失败必须附上实际观察证据文件');
    }
    if (record.result === 'running' && item.result !== 'running') item.attempt += 1;
    const event = {
      at: now,
      attempt: item.attempt,
      result: record.result,
      note: record.note.trim(),
      evidence
    };
    item.history.push(event);
    Object.assign(item, event);
    run.updatedAt = now;
    run.revision += 1;
  }

  return { labels, summarize, updateItem };
});
