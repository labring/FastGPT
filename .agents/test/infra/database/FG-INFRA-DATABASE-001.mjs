import assert from 'node:assert/strict';
import { runNodeCase } from '../../support/runtime.mjs';
import { success } from '../../support/scenario.mjs';
import { privateDatabase } from '../../support/private.mjs';
import { chatHarness } from '../../support/chat.mjs';

/** 历史字段只在本轮 dev 记录构造；真实 API 核验 lease 优先级，保留旧消息和变量。 */
async function legacy(context) {
  const h = await chatHarness(context),
    { c } = h,
    { db, ObjectId } = await privateDatabase(context, c);
  const appId = c.fixture.apps.database;
  for (const old of [0, 1, 2])
    for (const sourceType of [undefined, 'app']) {
      const chatId = `${c.run}-legacy-${old}-${sourceType ?? 'missing'}`;
      const first = await h.start({ appId, chatId });
      await h.finish(first);
      const query = { appId: new ObjectId(appId), chatId };
      await db
        .collection('chats')
        .updateOne(query, { $set: { chatGenerateStatus: old, variables: { fgFixture: c.run } } });
      await db
        .collection('chats')
        .updateOne(query, sourceType ? { $set: { sourceType } } : { $unset: { sourceType: '' } });
      const before = await db.collection('chats').findOne(query),
        body = { appId, chatIds: [chatId] };
      const status = () =>
        c.request({
          role: 'A',
          kind: 'state',
          route: '/api/core/chat/history/getHistoryStatus',
          body
        });
      assert.equal(success(await status()).list[0].chatGenerateStatus, 1);
      const next = await h.start({ appId, chatId });
      assert.equal(success(await status()).list[0].chatGenerateStatus, 0);
      const list = success(
        await c.request({
          role: 'A',
          kind: 'state',
          route: '/api/core/chat/history/getHistories',
          body: { appId, pageNum: 1, pageSize: 100 }
        })
      );
      assert.equal(list.list.find((row) => row.chatId === chatId).chatGenerateStatus, 0);
      await h.finish(next);
      const after = await db.collection('chats').findOne(query);
      assert.equal(after.chatGenerateStatus, old);
      assert.deepEqual(after.variables, before.variables);
      assert.equal(success(await status()).list[0].chatGenerateStatus, 1);
      c.record('历史 BSON 对照', { old, sourceType, before, after });
    }
  const fresh = await h.start({ appId });
  const data = await h.finish(fresh);
  assert.equal(Object.hasOwn(data.chats[0], 'chatGenerateStatus'), false);
  return '0/1/2 × 有/无 sourceType 均由真实 lease 决定状态；正常续聊，旧消息/变量/字段保留，新文档无旧状态';
}

await runNodeCase('FG-INFRA-DATABASE-001', { C1: legacy });
