import assert from 'node:assert/strict';
import { runNodeCase, Blocked } from '../../support/runtime.mjs';
import { createScenario, required, success, permissionDenied } from '../../support/scenario.mjs';

/** 只覆盖完整的 API 子场景 C3/C4/C6；列展示、hover 和页面导出留给 UI 执行项。 */
async function execute(context) {
  const c = createScenario(context);
  await c.keyInfo('logViewer');
  if (context.itemId === 'C6') await c.keyInfo('N');
  const f = required(c.fixture.logs, 'logs');
  const appId = required(f.appId, 'logs.appId');
  const records = required(f.records, 'logs.records');
  assert.ok(
    records.length >= 7 && new Set(records.map((r) => r.chatId)).size === records.length,
    '需要完整且无重复的 D1 清单'
  );
  for (const ref of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'])
    required(
      records.find((r) => r.ref === ref),
      'logs.records.' + ref
    );
  const expected = Object.fromEntries(records.map((row) => [row.ref, row]));
  const a = c.actor('A').tmbId,
    b = c.actor('B').tmbId;
  const u1 = expected.R2.outLinkUid,
    u2 = expected.R3.outLinkUid;
  if (
    !a ||
    !b ||
    a === b ||
    !u1 ||
    !u2 ||
    new Set([a, b, u1, u2]).size !== 4 ||
    expected.R1.tmbId !== a ||
    expected.R1.outLinkUid ||
    expected.R1.source !== 'api' ||
    expected.R2.tmbId !== a ||
    expected.R2.source !== 'api' ||
    expected.R2.hasGoodFeedback !== true ||
    expected.R3.tmbId !== a ||
    expected.R3.source !== 'api' ||
    !expected.R3.chatId.includes(required(f.searchPrefix, 'logs.searchPrefix')) ||
    expected.R4.tmbId !== b ||
    expected.R4.outLinkUid !== u1 ||
    expected.R4.source !== 'api' ||
    expected.R5.tmbId !== a ||
    expected.R5.outLinkUid !== b ||
    expected.R5.source !== 'api' ||
    expected.R6.tmbId !== b ||
    expected.R6.outLinkUid !== b ||
    expected.R6.source !== 'share' ||
    expected.R7.tmbId !== a ||
    expected.R7.outLinkUid !== b ||
    expected.R7.source !== 'share'
  ) {
    throw new Blocked('D1 manifest 不符合 R1–R7 的身份/来源/反馈/搜索前提');
  }
  const base = {
    appId,
    dateStart: required(f.dateStart, 'logs.dateStart'),
    dateEnd: required(f.dateEnd, 'logs.dateEnd')
  };
  const actual = await c.snapshot(
    appId,
    records.map((r) => r.chatId)
  );
  assert.equal(actual.chats.length, records.length, 'D1 主数据缺失');
  assert.equal(actual.logs.length, records.length, 'D1 统计尚未完成');
  for (const record of records) {
    const chat = actual.chats.find((chat) => chat.chatId === record.chatId);
    assert.equal(String(chat.tmbId), record.tmbId);
    assert.equal(chat.outLinkUid || '', record.outLinkUid || '');
    assert.equal(chat.source, record.source);
    const log = actual.logs.find((row) => row.chatId === record.chatId);
    assert.equal(log.userId, record.outLinkUid || record.tmbId, '主记录与统计使用者一致');
    assert.equal(log.source, record.source);
    assert.equal(Boolean(chat.hasGoodFeedback), Boolean(record.hasGoodFeedback));
    assert.ok(
      new Date(chat.updateTime) >= new Date(base.dateStart) &&
        new Date(chat.updateTime) <= new Date(base.dateEnd),
      'D1 记录不在声明的时间窗'
    );
    if (record.title !== undefined) assert.equal(chat.title, record.title);
    if (record.customTitle !== undefined) assert.equal(chat.customTitle, record.customTitle);
  }
  const call = (route, { role = 'logViewer', ...body }) =>
    c.request({
      role,
      kind: route === 'exportLogs' ? 'state' : 'key',
      route: '/api/core/app/logs/' + route,
      body: { ...base, ...body }
    });

  /** 分页集合由独立 manifest 计算，不调用产品筛选函数作测试 oracle。 */
  async function list(filter, expected) {
    const ids = [];
    for (let pageNum = 1; ; pageNum++) {
      const data = success(await call('list', { ...filter, pageSize: 2, pageNum }));
      assert.equal(data.total, expected.length);
      ids.push(...data.list.map((row) => row.chatId));
      if (ids.length >= data.total) break;
      assert.ok(data.list.length && pageNum <= records.length, '分页提前为空或无法结束');
    }
    assert.equal(new Set(ids).size, ids.length, '分页重复');
    assert.deepEqual(ids.sort(), expected.map((row) => row.chatId).sort());
  }

  if (context.itemId === 'C3') {
    const a = required(c.actor('A').tmbId, 'A.tmbId');
    const u1 = required(records.find((r) => r.ref === 'R2').outLinkUid, 'R2.outLinkUid');
    const variants = [
      {},
      { tmbIds: [a], outLinkUids: [] },
      { tmbIds: [], outLinkUids: [u1] },
      { tmbIds: [a], outLinkUids: [u1] },
      { tmbIds: [], outLinkUids: [] },
      { outLinkUids: [u1], sources: ['api'] },
      { outLinkUids: [u1], chatSearch: required(f.searchPrefix, 'logs.searchPrefix') },
      { outLinkUids: [u1], feedbackType: 'good' },
      { outLinkUids: [u1], sources: ['api'], chatSearch: f.searchPrefix, feedbackType: 'good' }
    ];
    for (const filter of variants) {
      const expected = records.filter((row) => {
        const selected = filter.tmbIds === undefined && filter.outLinkUids === undefined;
        const user =
          selected ||
          (filter.tmbIds?.includes(row.tmbId) && !row.outLinkUid) ||
          filter.outLinkUids?.includes(row.outLinkUid);
        const search =
          !filter.chatSearch ||
          [row.chatId, row.title, row.customTitle].some((value) =>
            value?.toLowerCase().includes(filter.chatSearch.toLowerCase())
          );
        return (
          user &&
          (!filter.sources || filter.sources.includes(row.source)) &&
          search &&
          (!filter.feedbackType || row.hasGoodFeedback === true)
        );
      });
      await list(filter, expected);
    }
    return '成员/外部 UID 组内 OR、来源/搜索/反馈组间 AND、空选与省略差异及全部分页集合均核对';
  }

  if (context.itemId === 'C4') {
    const a = c.actor('A');
    const searches = [
      required(records.find((r) => r.ref === 'R2').outLinkUid, 'R2 UID'),
      required(a.name, 'A.name'),
      required(a.username, 'A.username'),
      '.*'
    ];
    const members = Object.values(c.fixture.actors).filter((actor) => actor.tmbId);
    for (const searchKey of searches) {
      const lower = searchKey.toLowerCase();
      const memberIds = members
        .filter((member) =>
          [member.name, member.username].some((value) => value?.toLowerCase().includes(lower))
        )
        .map((member) => member.tmbId);
      const matching = records.filter((row) => {
        const id = row.outLinkUid || row.tmbId;
        return id.toLowerCase().includes(lower) || memberIds.includes(id);
      });
      const expectedGroups = new Map();
      for (const row of matching) {
        const id = row.outLinkUid || row.tmbId;
        const key = JSON.stringify([id, row.source]);
        expectedGroups.set(key, (expectedGroups.get(key) ?? 0) + 1);
      }
      const users = [];
      for (let pageNum = 1; ; pageNum++) {
        const data = success(await call('getUsers', { searchKey, pageSize: 2, pageNum }));
        assert.equal(data.total, expectedGroups.size);
        users.push(...data.list);
        if (users.length >= data.total) break;
        assert.ok(data.list.length && pageNum <= records.length, '用户分页未结束');
      }
      assert.equal(users.length, expectedGroups.size);
      const groups = [...expectedGroups].map(([key, count]) => ({
        id: JSON.parse(key)[0],
        source: JSON.parse(key)[1],
        count
      }));
      groups.sort(
        (first, second) =>
          second.count - first.count ||
          (first.id < second.id
            ? -1
            : first.id > second.id
              ? 1
              : first.source < second.source
                ? -1
                : first.source > second.source
                  ? 1
                  : 0)
      );
      // 接口不暴露 source，但按 source 分组；逐页 UID/计数序列须与独立排序完全一致。
      assert.deepEqual(
        users.map((user) => ({ id: user.outLinkUid || user.tmbId, count: user.count })),
        groups.map(({ id, count }) => ({ id, count }))
      );
    }
    return '外部 UID、成员名/用户名及正则元字符字面搜索的完整分页、分组总数和 UID 集合已核对';
  }

  if (context.itemId === 'C6') {
    // 导出接口只开放 Cookie；先确认两份登录态有效，失效登录不能充当无日志权限。
    await c.sessionInfo('logViewer');
    await c.sessionInfo('N');
    // 正向控制先确认这三类请求满足当前契约，避免参数错误伪装成权限拒绝。
    const routes = [
      ['list', { pageSize: 2, pageNum: 1 }],
      ['getUsers', { pageSize: 2, pageNum: 1 }],
      [
        'exportLogs',
        {
          title: 'FG-TEST logs',
          sourcesMap: { api: { label: 'API' }, share: { label: '分享' } },
          logKeys: ['sessionId', 'user', 'authUser']
        }
      ]
    ];
    const foreign = required(f.foreignAppId, 'logs.foreignAppId');
    const foreignApp = await c.appInfo(foreign);
    if (!foreignApp || String(foreignApp.teamId) === c.fixture.teamId)
      throw new Blocked('logs.foreignAppId 必须是实际存在的其他团队应用');
    for (const [route, body] of routes) {
      const positive = await call(route, body);
      if (route === 'exportLogs') {
        assert.equal(positive.http, 200);
        assert.match(positive.contentType, /text\/csv/);
      } else success(positive);
      permissionDenied(await call(route, { ...body, role: 'N' }));
      permissionDenied(await call(route, { ...body, appId: foreign }));
    }
    return '三类日志接口均有正向控制；无日志权限成员和跨团队资源请求实际鉴权拒绝';
  }
}

await runNodeCase('FG-CHAT-HISTORY-FEEDBACK-001', { C3: execute, C4: execute, C6: execute });
