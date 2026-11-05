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
  const executors = { script: '脚本', ai: 'AI' };

  /** 未执行时明确标注计划执行方；AI 复核不会篡改原实际执行方。 */
  function executorLabel(item) {
    if (!item.selected) return '未纳入';
    const label = executors[item.executor ?? item.plannedExecutor ?? 'ai'];
    return item.attempt ? label : label + '（未执行）';
  }

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
    const reviewer = record.reviewer ?? null;
    if (reviewer !== null && reviewer !== 'ai') throw new Error('reviewer 仅支持 ai');
    if (reviewer && (!['failed', 'blocked'].includes(item.result) || record.result !== item.result))
      throw new Error('AI 复核只追加原失败/阻塞说明；实际复测需先 running');
    const executor =
      record.executor ??
      (record.result === 'running' && item.result !== 'running' ? 'ai' : (item.executor ?? 'ai'));
    if (!Object.hasOwn(executors, executor)) throw new Error('executor 必须为 script 或 ai');
    if (
      item.executor &&
      executor !== item.executor &&
      !(record.result === 'running' && item.result !== 'running')
    )
      throw new Error('变更执行方必须先 running 开始新一次实际执行');
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
    if (['passed', 'failed'].includes(record.result) && !reviewer) {
      if (item.result !== 'running') throw new Error('判定前必须先标记 running；复测同样如此');
      if (!evidence.length) throw new Error('通过/失败必须附上实际观察证据文件');
    }
    if (reviewer && !evidence.length) throw new Error('AI 复核必须附证据');
    if (record.result === 'running' && item.result !== 'running') item.attempt += 1;
    const event = {
      at: now,
      attempt: item.attempt,
      result: record.result,
      executor,
      reviewer,
      note: record.note.trim(),
      evidence
    };
    item.history.push(event);
    Object.assign(item, event);
    run.updatedAt = now;
    run.revision += 1;
  }

  return { labels, executors, executorLabel, summarize, updateItem };
});
