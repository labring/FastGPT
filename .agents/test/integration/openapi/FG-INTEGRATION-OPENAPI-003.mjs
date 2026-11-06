import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { runNodeCase } from '../../support/runtime.mjs';
import { createScenario, success } from '../../support/scenario.mjs';
import { browserSession } from '../../support/chat.mjs';
import { appKeyWorld } from '../../support/app-key.mjs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { checkDocumentPublication } from '../../../../document/script/check-doc-publication.mjs';

const matter = createRequire(new URL('../../../../document/package.json', import.meta.url))(
  'gray-matter'
);

/** 按教程走真实应用 Key 主链路，按 UID 校验列表及删除差集。 */
async function tutorial(context) {
  const w = await appKeyWorld(context);
  const uid = w.label('客户+/一'),
    otherUid = w.label('other');
  const first = await w.completion(w.Ka, w.W, { uid, version: 'v1' });
  await w.completion(w.Ka, w.W, { uid, version: 'v1', chatId: first.chatId, round: 2 });
  const other = await w.completion(w.Ka, w.W, { uid: otherUid });
  const controls = await w.snapshot(w.W, [other.chatId]);
  const call = async (route, body, method = 'POST') =>
    success(await w.keyRequest(w.Ka, '/api' + route, body, method));
  const listing = await call('/core/chat/history/getHistories', {
    customUid: uid,
    offset: 0,
    pageSize: 20
  });
  assert.equal(listing.total, 1);
  assert.deepEqual(
    listing.list.map((r) => r.chatId),
    [first.chatId]
  );
  const records = await call('/core/chat/record/getPaginationRecords', {
    chatId: first.chatId,
    customUid: uid,
    offset: 0,
    pageSize: 20
  });
  assert.equal(records.total, 4);
  const customTitle = w.label('title');
  await call(
    '/core/chat/history/updateHistory',
    { chatId: first.chatId, customUid: uid, customTitle },
    'PUT'
  );
  assert.equal((await w.snapshot(w.W, [first.chatId])).chats[0].customTitle, customTitle);
  const query = (fields) => '?' + new URLSearchParams(fields);
  await call(
    '/core/chat/history/delHistory' + query({ chatId: first.chatId, customUid: uid }),
    undefined,
    'DELETE'
  );
  assert.ok((await w.snapshot(w.W, [first.chatId])).chats[0].deleteTime);
  const extra = [];
  for (let index = 0; index < 2; index++) extra.push(await w.completion(w.Ka, w.W, { uid }));
  await call('/core/chat/history/clearHistories' + query({ customUid: uid }), undefined, 'DELETE');
  assert.ok(
    (
      await w.snapshot(
        w.W,
        extra.map((r) => r.chatId)
      )
    ).chats.every((r) => r.deleteTime)
  );
  assert.equal((await call('/core/chat/history/getHistories', { customUid: uid })).total, 0);
  assert.deepEqual(await w.snapshot(w.W, [other.chatId]), controls);
  w.c.record('教程完整业务主链路', {
    appId: w.W,
    uid,
    first: first.chatId,
    other: other.chatId,
    cleared: extra.map((r) => r.chatId)
  });
  return '免 appId 的建会话、续聊、按 UID 列表/内容/改名/软删除/清空通过，其他 UID 无差集';
}

/** 真实 Scalar 与双语文档页面操作；字段断言只使用当前分支可见内容。 */
async function docs(context) {
  const c = createScenario(context);
  if (context.itemId === 'U4') {
    const publication = await checkDocumentPublication({
      baseUrl: c.fixture.docsBaseUrl ?? 'http://localhost:3005'
    });
    c.record('文档发布真实 HTTP 检查', publication);
  }
  const ui = await browserSession(context, { scenario: c, role: 'owner' });
  const p = ui.page,
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const capture = async (name) => {
    const file = context.itemId + '-' + name + '.png';
    await p.screenshot({ path: path.join(context.directory, file) });
    context.attachments.push({ path: file, label: name });
  };
  const json = async (doc) => {
    const r = await fetch(c.fixture.baseUrl + '/api/apidoc/' + doc + '.json');
    assert.equal(r.status, 200);
    return r.json();
  };
  const section = async ({ doc, spec, route, method }) => {
    const tag = spec.paths[route][method].tags[0];
    await p.goto(
      c.fixture.baseUrl +
        '/apidoc/' +
        doc +
        '#tag/' +
        encodeURIComponent(tag) +
        '/' +
        method.toUpperCase() +
        route,
      { timeout: 120000 }
    );
    const s = p.locator('[id$="/' + method.toUpperCase() + route + '"]').first();
    await expect(s).toBeVisible({ timeout: 120000 });
    return s;
  };
  const select = async (s, { index, name }) => {
    await s.locator('.composition-selector').nth(index).click();
    await p.getByRole('option', { name, exact: true }).click();
  };
  const field = (s, name) =>
    s.locator('.property-name').filter({ hasText: new RegExp('^' + name + '$') });
  const heading = (s, name) =>
    s.locator('.property-heading').filter({
      has: p.locator('.property-name').filter({ hasText: new RegExp('^' + name + '$') })
    });
  const nodes = (value) =>
    value && typeof value === 'object' ? [value, ...Object.values(value).flatMap(nodes)] : [];
  const bare = (value) => (value?.allOf?.length === 1 ? bare(value.allOf[0]) : value);
  if (context.itemId === 'U4') {
    const base = c.fixture.docsBaseUrl ?? 'http://localhost:3005';
    for (const [locale, title, group] of [
      ['zh-CN', '应用对接', '最佳实践'],
      ['en', 'App integration', 'Best practices']
    ]) {
      const intro = await p.goto(base + '/' + locale + '/openapi/intro', { timeout: 120000 });
      assert.equal(
        intro.status(),
        200,
        '文档服务必须已部署且公开介绍页可用，不能把统一 404 当作草稿通过'
      );
      await expect(p.locator('main h1').first()).toContainText(
        locale === 'en' ? 'API Documentation Introduction' : 'API 文档介绍'
      );
      const link = p.getByRole('link', { name: title, exact: true }).first();
      const suffix = locale === 'en' ? '.en' : '';
      const { data } = matter(
        await readFile(
          new URL(
            '../../../../document/content/openapi/best-practices/app-integration' + suffix + '.mdx',
            import.meta.url
          ),
          'utf8'
        )
      );
      if (data.draft === true) {
        await expect(link).toHaveCount(0);
        const target = '/' + locale + '/openapi/best-practices/app-integration';
        const response = await p.goto(base + target, { timeout: 120000 });
        assert.equal(response.status(), 404);
        await expect(p.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
        await capture(locale + '-draft');
        c.record('未发布教程不可访问', { locale, route: target, status: response.status() });
        continue;
      }
      if (!(await link.isVisible())) await p.getByText(group, { exact: true }).first().click();
      await link.click();
      await expect(p.getByRole('heading', { name: title, exact: true }).first()).toBeVisible();
      await p.reload();
      const text = await p.locator('main').innerText();
      for (const word of ['customUid', 'getHistories', 'clearHistories', 'authProxy', 'chatId'])
        assert.ok(text.includes(word), word);
      assert.ok(
        !text.includes('它没有 customUid 筛选参数') && !text.includes('It has no customUid filter')
      );
      for (const rule of locale === 'en'
        ? [
            'cannot change, omit, or clear',
            'Omitting customUid lists API sessions across users',
            'clears only that user',
            'does not process user identity parameters'
          ]
        : [
            '续聊不能更换、漏传或清空',
            '省略 customUid 会返回该应用下不同业务用户',
            '只清空该使用者的 API 来源会话',
            '不处理使用者身份参数'
          ])
        assert.ok(text.includes(rule), rule);
      const placeholder = locale === 'en' ? 'Image placeholder' : '配图占位';
      assert.equal(text.split(placeholder).length - 1, 3);
      const sample = await p.locator('pre').allTextContents();
      assert.ok(sample.some((code) => code.includes('getHistories') && code.includes('customUid')));
      assert.ok(
        sample.some((code) => code.includes('getPaginationRecords') && code.includes('customUid'))
      );
      await capture(locale);
      if (locale === 'en') {
        const intro = p.locator('main a[href*="/en/openapi/intro"]').first();
        await expect(intro).toBeVisible();
        await intro.click();
        await expect(p).toHaveURL(/\/en\/openapi\/intro/);
        await capture('en-intro');
      }
      c.record('真实双语教程', { locale, title, sample, route: p.url() });
    }
  } else
    for (const doc of ['systemopenapi', 'devapi']) {
      const spec = await json(doc);
      if (context.itemId === 'U1') {
        for (const version of ['v1', 'v2']) {
          const route = '/' + version + '/chat/completions';
          const s = await section({ doc, spec, route, method: 'post' });
          for (const [name, active, inactive] of [
            ['自定义使用者', 'customUid', 'authProxy'],
            ['代理团队成员', 'authProxy', 'customUid'],
            ['默认身份', undefined, undefined]
          ]) {
            await select(s, { index: 1, name: name });
            if (active) await expect(field(s, active)).toBeVisible();
            for (const key of active ? [inactive] : ['customUid', 'authProxy'])
              await expect(field(s, key)).toHaveCount(0);
            if (active === 'authProxy') await expect(field(s, 'tmbId')).toBeVisible();
            c.record('会话身份切换', {
              doc,
              version,
              name,
              headings: await s.locator('.property-heading:visible').allTextContents()
            });
          }
          await select(s, { index: 0, name: 'APP API Key（无需 appId）' });
          await expect(field(s, 'appId')).toHaveCount(0);
          await s.locator('.composition-selector').nth(1).click();
          const options = await p.getByRole('option').allTextContents();
          assert.ok(options.some((v) => v.includes('自定义使用者')));
          assert.ok(!options.some((v) => v.includes('代理团队成员')));
          await p.keyboard.press('Escape');
          const schema = spec.paths[route].post.requestBody.content['application/json'].schema;
          for (const key of ['stream', 'detail', 'retainDatasetCite', 'showSkillReferences']) {
            await expect(heading(s, key)).toBeVisible();
            await expect(heading(s, key)).not.toContainText('必填');
          }
          for (const node of nodes(schema))
            if (node.properties?.stream) {
              for (const key of ['stream', 'detail', 'retainDatasetCite', 'showSkillReferences'])
                assert.ok(!node.required?.includes(key), key);
            }
          await capture(doc + '-' + version);
          await p.reload();
          await expect(field(s, 'appId')).toBeVisible({ timeout: 120000 });
          await expect(field(s, 'customUid')).toHaveCount(0);
        }
      } else if (context.itemId === 'U2') {
        const s = await section({
          doc,
          spec,
          route: '/core/chat/history/getHistories',
          method: 'post'
        });
        for (const name of ['自定义使用者', '代理团队成员']) {
          await select(s, { index: 1, name: name });
          await expect(field(s, name === '自定义使用者' ? 'customUid' : 'authProxy')).toBeVisible();
          for (const [page, current, absent] of [
            ['按偏移量获取', 'offset', 'pageNum'],
            ['按页码获取', 'pageNum', 'offset']
          ]) {
            await s
              .locator('.composition-selector')
              .filter({ hasText: /按偏移量获取|按页码获取/ })
              .click();
            await p.getByRole('option', { name: page, exact: true }).click();
            await expect(field(s, current)).toBeVisible();
            await expect(field(s, absent)).toHaveCount(0);
            await expect(field(s, 'pageSize')).toHaveCount(1);
            await expect(heading(s, 'pageSize')).not.toContainText('必填');
            await expect(heading(s, 'pageSize')).toContainText(/默认值[：:]\s*20/);
            await expect(field(s, 'startCreateTime')).toBeVisible();
            c.record('身份和分页组合', {
              doc,
              name,
              page,
              fields: await s.locator('.property-heading:visible').allTextContents()
            });
          }
        }
        await capture(doc + '-paging');
        await select(s, { index: 1, name: '默认身份' });
        await expect(field(s, 'customUid')).toHaveCount(0);
        await expect(field(s, 'authProxy')).toHaveCount(0);
      } else if (context.itemId === 'U3') {
        const route = '/core/chat/init',
          op = spec.paths[route].get;
        const param = op.parameters[0];
        assert.equal(param.style, 'form');
        assert.equal(param.explode, true);
        const proxies = nodes(param.schema)
          .filter((n) => n.properties?.authProxy)
          .map((n) => bare(n.properties.authProxy));
        assert.ok(proxies.length);
        assert.ok(proxies.every((n) => n.type === 'string' && typeof n.example === 'string'));
        for (const path of ['/core/chat/history/getHistories', '/v2/chat/completions']) {
          const schema = spec.paths[path].post.requestBody.content['application/json'].schema;
          assert.ok(nodes(schema).some((n) => bare(n.properties?.authProxy)?.type === 'object'));
          for (const n of nodes(schema))
            if (['Skill 调试会话', '外链会话', '直接访问资源'].includes(n.title)) {
              assert.ok(!JSON.stringify(n).includes('"customUid":'));
              assert.ok(!JSON.stringify(n).includes('"authProxy":'));
            }
        }
        const batch =
          spec.paths['/core/chat/history/batchDelete'].post.requestBody.content['application/json']
            .schema;
        assert.ok(
          !JSON.stringify(batch).includes('"customUid":') &&
            !JSON.stringify(batch).includes('"authProxy":')
        );
        const s = await section({ doc, spec, route, method: 'get' });
        await select(s, { index: 1, name: '代理团队成员' });
        await expect(field(s, 'authProxy')).toBeVisible();
        await expect(field(s, 'authProxy').locator('..')).toContainText('string');
        await capture(doc + '-query');
        c.record('Query 与管理接口真实文档', { doc, param, batch });
      }
    }
  assert.deepEqual(errors, []);
  c.record('页面运行错误', { errors });
  return '真实文档页面、参数分支、可见字段及接口文档断言完成';
}
await runNodeCase(
  'FG-INTEGRATION-OPENAPI-003',
  Object.fromEntries(['U1', 'U2', 'U3', 'U4'].map((id) => [id, docs]).concat([['U5', tutorial]]))
);
