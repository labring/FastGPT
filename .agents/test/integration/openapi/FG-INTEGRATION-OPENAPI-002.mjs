import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { browserSession } from '../../support/chat.mjs';
import { runNodeCase, Blocked } from '../../support/runtime.mjs';
import { appKeyWorld, roles } from '../../support/app-key.mjs';
import { poll, success } from '../../support/scenario.mjs';

/** 管理矩阵使用真实登录成员；M1/M5 还通过无头 Chromium 完成页面验收。 */
async function execute(context) {
  const w = await appKeyWorld(context),
    { c, W, X, Ka, Kb } = w;
  const list = async (role, appId = W) =>
    success(
      await c.request({
        role,
        kind: 'state',
        method: 'GET',
        route: '/api/support/openapi/list?' + new URLSearchParams({ type: 'app', appId })
      })
    );
  const copy = async (role, id) => {
    const value = success(
      await c.request({
        role,
        kind: 'state',
        metadataOnly: true,
        route: '/api/support/openapi/copy',
        body: { id }
      })
    );
    context.secrets.add(value);
    return value;
  };
  /** 真实页面入口及持久化共同验收，创建明文弹窗关闭后才截图。 */
  async function openUI() {
    const ui = await browserSession(context, {
      scenario: c,
      role: 'A'
    });
    // 新建私有账号首次登录有联系方式引导，按真实可取消入口关闭后再操作页面。
    await ui.page.addLocatorHandler(
      ui.page.getByRole('dialog').filter({ has: ui.page.getByText('联系方式', { exact: true }) }),
      async (dialog) => dialog.getByRole('button', { name: '取消', exact: true }).click()
    );
    await ui.page.goto(
      c.fixture.baseUrl + '/app/detail?' + new URLSearchParams({ appId: W, currentTab: 'publish' }),
      { timeout: 120000, waitUntil: 'domcontentloaded' }
    );
    await ui.page.getByText('API 访问', { exact: true }).click({ timeout: 120000 });
    await expect(ui.page.getByRole('tab', { name: '应用 Key', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 60000 }
    );
    return ui;
  }
  function form(page) {
    return page
      .getByRole('dialog')
      .filter({ has: page.getByPlaceholder('key 的别名，仅用于展示') });
  }
  async function checkForm(page, app) {
    const dialog = form(page);
    await expect(dialog).toBeVisible();
    if (app) {
      await expect(dialog.getByText('绑定应用 ID: ' + W, { exact: true })).toBeVisible();
      await expect(dialog.getByText('身份代理', { exact: true })).toHaveCount(0);
      await expect(dialog.getByText('标签', { exact: true })).toHaveCount(0);
    } else {
      await expect(dialog.getByText('身份代理', { exact: true })).toBeVisible();
      await expect(dialog.getByText('标签', { exact: true })).toBeVisible();
    }
    return dialog;
  }
  async function uiCreate(ui, app) {
    const page = ui.page,
      name = w.keyName(app ? 'ui-app' : 'ui-personal');
    await page.getByRole('button', { name: app ? '新建应用 Key' : '新建', exact: true }).click();
    const dialog = await checkForm(page, app);
    await dialog.getByPlaceholder('key 的别名，仅用于展示').fill(name);
    const pending = page.waitForResponse(
      (r) => r.url().endsWith('/api/support/openapi/create') && r.request().method() === 'POST'
    );
    await dialog.getByRole('button', { name: '确认', exact: true }).click();
    const response = await pending,
      payload = await response.json();
    if (typeof payload.data === 'string') context.secrets.add(payload.data);
    assert.equal(payload.code, 200);
    const stored = await w.db
      .collection('openapis')
      .findOne({ apiKey: payload.data }, { projection: { apiKey: 0 } });
    assert.ok(stored);
    w.keys.push({ ...stored, id: String(stored._id), value: payload.data });
    const created = page
      .getByRole('dialog')
      .filter({ has: page.getByText(payload.data, { exact: true }) });
    await expect(created).toBeVisible();
    await created.getByRole('button', { name: '好的', exact: true }).click();
    await expect(created).toHaveCount(0);
    c.record('真实页面创建与落库', {
      name,
      id: String(stored._id),
      type: stored.type,
      appId: stored.appId,
      tmbId: stored.tmbId
    });
    return { name, id: String(stored._id), stored };
  }
  switch (context.itemId) {
    case 'M1': {
      const ui = await openUI(),
        page = ui.page;
      const createdApp = await uiCreate(ui, true);
      const search = page.getByPlaceholder('按 Key 名称或 Key 片段搜索');
      await search.fill(createdApp.name);
      await expect(page.getByRole('row').filter({ hasText: createdApp.name })).toBeVisible();
      await ui.capture('app-list');
      await w.acl('A', null, roles.createKey, 'team');
      await page.getByRole('tab', { name: '个人密钥', exact: true }).click();
      await expect(search).toHaveValue('');
      const createdPersonal = await uiCreate(ui, false);
      await search.fill(createdPersonal.name);
      await expect(page.getByRole('row').filter({ hasText: createdPersonal.name })).toBeVisible();
      await ui.capture('personal-list');
      await page.reload();
      await page.getByText('API 访问', { exact: true }).click();
      await expect(page.getByRole('tab', { name: '应用 Key', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(page.getByRole('row').filter({ hasText: createdApp.name })).toBeVisible();
      assert.deepEqual(
        (await list('A')).map((key) => key._id).sort(),
        [Ka.id, Kb.id, createdApp.id].sort()
      );
      await page.goto(c.fixture.baseUrl + '/account/apikey');
      await expect(page.getByRole('row').filter({ hasText: createdPersonal.name })).toBeVisible({
        timeout: 60000
      });
      await expect(page.getByRole('row').filter({ hasText: createdApp.name })).toHaveCount(0);
      await expect(page.getByRole('row').filter({ hasText: Kb.name })).toHaveCount(0);
      await ui.capture('account-personal-only');
      const personal = success(
        await c.request({
          role: 'A',
          kind: 'state',
          method: 'GET',
          route: '/api/support/openapi/list'
        })
      );
      assert.ok(
        personal.every(
          (key) => key.type === 'personal' && !key.appId && key.tmbId === c.actor('A').tmbId
        )
      );
      assert.ok(personal.some((key) => key._id === createdPersonal.id));
      return '真实浏览器完成双 Tab 创建、搜索、重载和账号页核对；表单/列表/持久化按两类凭证隔离';
    }
    case 'M2': {
      // 两名普通成员仅有 W 管理权限，没有团队创建 Key 权限；创建人不限制列表及 CRUD。
      for (const role of ['A', 'B']) await w.acl(role, null, roles.none, 'team');
      const before = await w.keySnapshot([Ka.id, Kb.id]);
      for (const [role, key] of [
        ['B', Ka],
        ['A', Kb]
      ]) {
        const rows = await list(role);
        assert.deepEqual(rows.map((row) => row._id).sort(), [Ka.id, Kb.id].sort());
        assert.ok(rows.every((row) => row.canCopy && row.apiKey.startsWith('******')));
        const value = await copy(role, key.id);
        assert.equal(value, key.value);
        success(
          await c.request({
            role,
            kind: 'state',
            method: 'PUT',
            route: '/api/support/openapi/update',
            body: { _id: key.id, name: w.keyName('renamed'), limit: { maxUsagePoints: 1000 } }
          })
        );
        const after = (await w.keySnapshot([key.id]))[0];
        assert.equal(String(after.tmbId), String(key.tmbId));
        assert.equal(after.limit.maxUsagePoints, 1000);
        await w.completion({ ...key, value }, W);
        await poll(async () => {
          const audits = await w.log
            .collection('operationlogs')
            .find({
              teamId: w.teamId,
              tmbId: w.oid(c.actor(role).tmbId),
              'metadata.keyId': key.id,
              timestamp: { $gte: w.startedAt },
              event: { $in: ['COPY_API_KEY', 'UPDATE_API_KEY'] }
            })
            .toArray();
          assert.deepEqual([...new Set(audits.map((row) => row.event))].sort(), [
            'COPY_API_KEY',
            'UPDATE_API_KEY'
          ]);
          assert.ok(!JSON.stringify(audits).includes(value));
          c.record('实际操作者审计', audits);
        });
      }
      c.record('原始 Key 归属', before);
      return '两个管理员互看、复制和修改对方 Key；原值可调用，归属不变且审计记录真实操作者';
    }
    case 'M3': {
      const before = await w.keySnapshot([Ka.id, Kb.id, w.Kx.id]);
      const pb = await w.db
        .collection('openapis')
        .findOne({ apiKey: w.personal('B').value }, { projection: { _id: 1 } });
      await w.acl('N', null, roles.createKey, 'team');
      async function forbidden(role, credential) {
        const cert = credential
          ? { kind: 'key', keyValue: credential, role: 'A' }
          : { role, kind: 'state' };
        for (const flags of [{}, { type: 'personal', appId: X }]) {
          const operations = [
            ['POST', '/create', { ...flags, type: 'app', appId: W, name: w.keyName('forbidden') }],
            ['GET', '/list?' + new URLSearchParams({ type: 'app', appId: W }), undefined],
            ['POST', '/copy', { id: Ka.id, ...flags }],
            ['PUT', '/update', { _id: Ka.id, name: 'forbidden', ...flags }],
            ['DELETE', '/delete?id=' + Ka.id + '&' + new URLSearchParams(flags), undefined]
          ];
          for (const [method, route, body] of operations) {
            const response = await c.request({
              ...cert,
              method,
              route: '/api/support/openapi' + route,
              body
            });
            await w.denied(
              response,
              Object.keys(flags).length > 0 && response.http === 400 && response.json?.code === 400
            );
          }
        }
      }
      for (const permission of [roles.none, roles.read, roles.write, roles.logs]) {
        await w.acl('N', W, permission);
        await forbidden('N');
      }
      await w.acl('A', W, roles.none);
      await forbidden('A');
      await w.acl('A', W, roles.manage);
      for (const extra of [{}, { type: 'app', appId: W }])
        await w.denied(
          await c.request({
            role: 'A',
            kind: 'state',
            route: '/api/support/openapi/copy',
            body: { id: String(pb._id), ...extra }
          })
        );
      const personal = success(
        await c.request({
          role: 'A',
          kind: 'state',
          method: 'GET',
          route: '/api/support/openapi/list?type=personal&appId=' + W
        })
      );
      assert.ok(!personal.some((key) => key._id === String(pb._id)));
      await forbidden(undefined, Ka.value);
      assert.deepEqual(await w.keySnapshot([Ka.id, Kb.id, w.Kx.id]), before);
      assert.equal(await w.db.collection('openapis').countDocuments({ appId: W }), 2);
      return '使用/编辑/日志/无权限及撤权创建人均不能管理；仅 Key 和伪造类型不扩大范围，他人个人密钥不泄露';
    }
    case 'M4': {
      await w.acl('A', X, roles.none);
      const foreign = await w.foreignApp(),
        before = await w.keySnapshot([Ka.id]);
      const count = await w.db.collection('openapis').countDocuments({ teamId: w.teamId });
      for (const body of [
        { type: 'app' },
        { type: 'app', appId: X },
        { type: 'app', appId: foreign.appId },
        { type: 'app', appId: W, authProxy: false },
        { type: 'app', appId: W, tags: [] },
        { type: 'personal', appId: W }
      ]) {
        const response = await c.request({
          role: 'A',
          kind: 'state',
          route: '/api/support/openapi/create',
          body: { name: w.keyName('invalid'), ...body }
        });
        if (!body.appId || 'authProxy' in body || 'tags' in body || body.type === 'personal')
          await w.denied(response, true);
        else await w.denied(response);
      }
      for (const extra of [{ type: 'personal' }, { appId: X }, { tmbId: c.actor('B').tmbId }])
        await w.denied(
          await c.request({
            role: 'A',
            kind: 'state',
            method: 'PUT',
            route: '/api/support/openapi/update',
            body: { _id: Ka.id, name: 'forbidden', ...extra }
          }),
          true
        );
      assert.equal(await w.db.collection('openapis').countDocuments({ teamId: w.teamId }), count);
      assert.deepEqual(await w.keySnapshot([Ka.id]), before);
      const upper = await w.createKey('A', W.toUpperCase());
      assert.equal(upper.appId, W);
      success(
        await c.request({
          role: 'A',
          kind: 'state',
          method: 'DELETE',
          route: '/api/support/openapi/delete?id=' + upper.id
        })
      );
      // 私有历史夹具覆盖旧 String 大写存储，不通过新 API 非法修改绑定。
      const legacy = {
        ...Ka,
        _id: new (w.oid(Ka.id).constructor)(),
        apiKey: 'fg-legacy-' + w.label('key'),
        appId: W.toUpperCase()
      };
      delete legacy.type;
      delete legacy.id;
      delete legacy.value;
      context.secrets.add(legacy.apiKey);
      await w.db.collection('openapis').insertOne(legacy);
      assert.equal((await list('A')).filter((row) => row._id === String(legacy._id)).length, 1);
      const max = c.fixture.appKeys?.maxKeyCount;
      if (!Number.isInteger(max) || max < 3 || max > 10)
        throw new Blocked('M4/M6 需要实际配置并核实 3～10 的私有 OPENAPI_KEY_MAX_COUNT');
      while (
        (await w.db
          .collection('openapis')
          .countDocuments({ appId: { $in: [W, W.toUpperCase()] } })) < max
      )
        await w.createKey('A', W);
      const refused = await c.request({
        role: 'A',
        kind: 'state',
        route: '/api/support/openapi/create',
        body: { type: 'app', appId: W, name: w.keyName('quota') }
      });
      assert.equal(refused.error, true);
      assert.equal(refused.json?.statusText, 'openapiExceedLimit');
      return '非法创建/不可变字段均拒绝，大小写新绑定规范化；历史大写绑定出现在同一列表并计入同一额度';
    }
    case 'M5': {
      await w.acl('A', null, roles.createKey, 'team');
      const result = await c.request({
        role: 'A',
        kind: 'state',
        metadataOnly: true,
        route: '/api/support/openapi/create',
        body: { name: w.keyName('default-personal') }
      });
      const value = success(result);
      context.secrets.add(value);
      const row = await w.db
        .collection('openapis')
        .findOne({ apiKey: value }, { projection: { apiKey: 0 } });
      assert.equal(row.type, 'personal');
      w.keys.push({ ...row, id: String(row._id), value });
      const oldList = success(
        await c.request({
          role: 'A',
          kind: 'state',
          method: 'GET',
          route: '/api/support/openapi/list?appId=' + W
        })
      );
      assert.ok(
        oldList.every((key) => key.type === 'personal' && key.tmbId === c.actor('A').tmbId)
      );
      assert.ok(oldList.some((key) => key._id === String(row._id)));
      const tag = success(
        await c.request({
          role: 'A',
          kind: 'state',
          route: '/api/support/openapi/tag/create',
          body: { name: w.keyName('tag') }
        })
      );
      context.itemFinalizers.push(async () =>
        success(
          await c.request({
            role: 'A',
            kind: 'state',
            method: 'DELETE',
            route: '/api/support/openapi/tag/delete?tagId=' + tag._id
          })
        )
      );
      success(
        await c.request({
          role: 'A',
          kind: 'state',
          method: 'PUT',
          route: '/api/support/openapi/update',
          body: { _id: String(row._id), tags: [tag._id] }
        })
      );
      await w.db
        .collection('openapis')
        .updateOne({ _id: w.oid(Ka.id) }, { $set: { tagIds: [w.oid(tag._id)] } });
      const tags = success(
        await c.request({
          role: 'A',
          kind: 'state',
          method: 'GET',
          route: '/api/support/openapi/tag/list?withKeyCount=true'
        })
      );
      assert.equal(tags.find((item) => item._id === tag._id).keyCount, 1);
      // 两个真实记录的时间序相反，才能区分排序选项实际生效，而非只验证单行结果。
      const earlier = new Date(Date.now() - 120000),
        later = new Date(Date.now() - 60000);
      await w.db
        .collection('openapis')
        .updateOne({ _id: w.oid(Ka.id) }, { $set: { createTime: earlier, lastUsedTime: later } });
      await w.db
        .collection('openapis')
        .updateOne({ _id: w.oid(Kb.id) }, { $set: { createTime: later, lastUsedTime: earlier } });
      for (const sortBy of ['createTime', 'lastUsedTime']) {
        const rows = success(
          await c.request({
            role: 'A',
            kind: 'state',
            method: 'GET',
            route:
              '/api/support/openapi/list?' + new URLSearchParams({ type: 'app', appId: W, sortBy })
          })
        );
        assert.deepEqual(
          rows.map((key) => key._id),
          sortBy === 'createTime' ? [Kb.id, Ka.id] : [Ka.id, Kb.id]
        );
        assert.ok(rows.every((key) => !key.tags.length && !key.tagIds.length));
      }
      const searched = success(
        await c.request({
          role: 'A',
          kind: 'state',
          method: 'GET',
          route:
            '/api/support/openapi/list?' +
            new URLSearchParams({ type: 'app', appId: W, keyword: Ka.name })
        })
      );
      assert.deepEqual(
        searched.map((key) => key._id),
        [Ka.id]
      );
      const ui = await openUI(),
        page = ui.page,
        search = page.getByPlaceholder('按 Key 名称或 Key 片段搜索');
      await page.getByText('调用示例', { exact: true }).click();
      await expect(page.locator('pre')).not.toContainText('appId');
      await page
        .getByRole('row')
        .filter({ hasText: Ka.name })
        .getByRole('button', { name: '编辑', exact: true })
        .click();
      const appForm = await checkForm(page, true);
      await appForm.getByRole('button', { name: '关闭', exact: true }).click();
      await search.fill(Ka.name);
      await page.getByRole('tab', { name: '个人密钥', exact: true }).click();
      await expect(search).toHaveValue('');
      await expect(page.locator('pre')).toContainText('appId');
      await expect(page.locator('pre')).toContainText(W);
      await page
        .getByRole('row')
        .filter({ hasText: row.name })
        .getByRole('button', { name: '编辑', exact: true })
        .click();
      const personalForm = await checkForm(page, false);
      await personalForm.getByRole('button', { name: '关闭', exact: true }).click();
      await search.fill(row.name);
      await page.getByRole('tab', { name: '应用 Key', exact: true }).click();
      await expect(search).toHaveValue('');
      await expect(page.locator('pre')).not.toContainText('appId');
      await expect(page.getByRole('row').filter({ hasText: Ka.name })).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: Kb.name })).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: row.name })).toHaveCount(0);
      await ui.capture('tabs-and-examples');
      return '省略 type 保持个人范围，标签计数只统计个人；真实页面验证编辑表单、筛选和调用示例切 Tab 不串用';
    }
    case 'M6': {
      const max = c.fixture.appKeys?.maxKeyCount;
      if (!Number.isInteger(max) || max < 3 || max > 10)
        throw new Blocked('需要真实私有实例 OPENAPI_KEY_MAX_COUNT=3～10');
      await w.acl('A', null, roles.createKey, 'team');
      const personalIds = () =>
        w.db
          .collection('openapis')
          .find(
            {
              teamId: w.teamId,
              tmbId: w.oid(c.actor('A').tmbId),
              $or: [{ type: 'personal' }, { type: { $exists: false }, appId: { $in: [null, ''] } }]
            },
            { projection: { _id: 1 } }
          )
          .toArray();
      while ((await personalIds()).length < max) await w.createKey('A');
      const empty = await w.app('quota-empty');
      await w.acl('A', empty, roles.manage);
      await w.acl('N', empty, roles.manage);
      await w.createKey('A', empty);
      const quotaDenied = async (body) => {
        const response = await c.request({
          role: 'A',
          kind: 'state',
          route: '/api/support/openapi/create',
          body: { name: w.keyName('over-limit'), ...body }
        });
        assert.equal(response.error, true);
        assert.equal(response.json?.statusText, 'openapiExceedLimit');
      };
      await quotaDenied({ type: 'personal' });
      const removable = w.keys.find((key) => key.type === 'personal');
      assert.ok(removable);
      success(
        await c.request({
          role: 'A',
          kind: 'state',
          method: 'DELETE',
          route: '/api/support/openapi/delete?id=' + removable.id
        })
      );
      while ((await list('A')).length < max) await w.createKey('A', W);
      await w.createKey('A');
      await quotaDenied({ type: 'app', appId: W });
      await w.acl('N', null, roles.none, 'team');
      await w.createKey('N', empty);
      await w.denied(
        await c.request({
          role: 'N',
          kind: 'state',
          route: '/api/support/openapi/create',
          body: { type: 'personal', name: w.keyName('requires-team-role') }
        })
      );
      return '本人个人额度与应用额度分别计算；应用管理员无团队创建权限可建应用 Key，个人密钥仍拒绝';
    }
    case 'M7': {
      const foreign = await w.foreignApp(),
        first = await w.completion(Ka, W);
      const personalIds = await w.db
        .collection('openapis')
        .find(
          {
            teamId: w.teamId,
            tmbId: { $in: [w.oid(c.actor('A').tmbId), w.oid(c.actor('B').tmbId)] },
            type: 'personal'
          },
          { projection: { _id: 1 } }
        )
        .toArray();
      const preservedIds = [
        Kb.id,
        w.Kx.id,
        foreign.key.id,
        ...personalIds.map((row) => String(row._id))
      ];
      const before = await w.keySnapshot(preservedIds);
      const chats = await w.snapshot(W, [first.chatId]);
      const raw = await copy('B', Ka.id);
      assert.equal(raw, Ka.value);
      success(
        await c.request({
          role: 'B',
          kind: 'state',
          method: 'DELETE',
          route: '/api/support/openapi/delete?id=' + Ka.id
        })
      );
      await w.denied(
        await w.keyRequest(Ka, '/api/v2/chat/completions', {
          chatId: w.label('revoked'),
          stream: false,
          messages: [{ role: 'user', content: 'probe' }]
        })
      );
      assert.equal(await w.db.collection('openapis').countDocuments({ _id: w.oid(Ka.id) }), 0);
      assert.deepEqual(await w.keySnapshot(preservedIds), before);
      assert.deepEqual(await w.snapshot(W, [first.chatId]), chats);
      assert.ok(!(await list('B')).some((row) => row._id === Ka.id));
      return '另一管理员删除 Key 后原值立即无效，旧会话及其他成员/应用/团队 Key 均保留';
    }
  }
}
await runNodeCase(
  'FG-INTEGRATION-OPENAPI-002',
  Object.fromEntries(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'].map((id) => [id, execute]))
);
