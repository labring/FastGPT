import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runNodeCase } from '../../support/runtime.mjs';
import { createScenario, success } from '../../support/scenario.mjs';
import { privateDatabase, redisTools } from '../../support/private.mjs';
import { chatHarness } from '../../support/chat.mjs';

/** 历史字段只在私有库构造；真实 API 核验 lease 优先级，保留旧消息和变量。 */
async function legacy(context) {
  const h = await chatHarness(context),
    { c } = h,
    { db, ObjectId } = await privateDatabase(context, c);
  await h.redis.assertPrivate();
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

/** 当前 Chat schema 与真实 MongoIndexManager，在独立集合核对索引清理和重入。 */
async function indexes(context) {
  const c = createScenario(context),
    privateDb = await privateDatabase(context, c);
  const environment = JSON.parse(
    await readFile(c.secret(c.fixture.privateEnvironment.serviceEnvFileEnv), 'utf8')
  );
  for (const value of Object.values(environment))
    if (typeof value === 'string') context.secrets.add(value);
  Object.assign(process.env, environment);
  process.env.MONGODB_URI = privateDb.uri;
  process.env.MONGODB_LOG_URI = privateDb.uri;
  process.env.SYNC_INDEX = 'false';
  const tools = await redisTools(context, c),
    { MongoChat } = tools.load('packages/service/core/chat/chatSchema.ts'),
    { MongoIndexManager } = tools.load('packages/service/common/mongo/indexManager.ts');
  const req = createRequire(new URL('../../../../packages/service/package.json', import.meta.url));
  const mongoose = tools.tsx.require(req.resolve('mongoose'), tools.parent);
  const connection = await mongoose
    .createConnection(privateDb.uri, { autoIndex: false, autoCreate: false })
    .asPromise();
  context.cleanups.unshift(async () => {
    await connection.close();
  });
  for (const variant of context.itemId === 'C2' ? ['exact'] : ['mismatch', 'missing']) {
    const collection = 'fg_index_' + randomBytes(8).toString('hex'),
      model = connection.model('FGTestChat' + collection, MongoChat.schema, collection);
    await model.createCollection();
    context.cleanups.push(async () => model.collection.drop());
    if (variant !== 'missing')
      await model.collection.createIndex(
        variant === 'exact' ? { chatGenerateStatus: 1, updateTime: 1 } : { chatGenerateStatus: 1 },
        {
          name: 'chatGenerateStatus_1_updateTime_1',
          ...(variant === 'exact' ? { partialFilterExpression: { chatGenerateStatus: 0 } } : {})
        }
      );
    await model.collection.createIndex({ fgCustomerField: 1 }, { name: 'customer_owned' });
    const before = await model.collection.indexes(),
      logs = [];
    const logger = Object.fromEntries(
      ['debug', 'info', 'warn', 'error'].map((level) => [
        level,
        (message, data) => logs.push({ level, message, data })
      ])
    );
    const result = await MongoIndexManager.syncModelIndexes({ model, logger }),
      after = await model.collection.indexes();
    assert.equal(
      result.cleanupReport.items.find(
        (row) => row.indexName === 'chatGenerateStatus_1_updateTime_1'
      )?.action,
      variant === 'exact' ? 'drop' : variant === 'missing' ? 'skip_missing' : 'skip_mismatch'
    );
    assert.ok(after.some((index) => index.name === 'customer_owned'));
    assert.equal(
      after.some((index) => index.name === 'chatGenerateStatus_1_updateTime_1'),
      variant === 'mismatch'
    );
    const current = new Set(
      MongoChat.schema.indexes().map(
        ([key, options]) =>
          options.name ??
          Object.entries(key)
            .map(([field, value]) => field + '_' + value)
            .join('_')
      )
    );
    assert.ok(
      [...current].every((name) => after.some((index) => index.name === name)),
      '当前索引已建立'
    );
    if (variant === 'exact') {
      assert.deepEqual(
        before
          .filter((row) => !after.some((next) => next.name === row.name))
          .map((row) => row.name),
        ['chatGenerateStatus_1_updateTime_1']
      );
      const again = await MongoIndexManager.syncModelIndexes({ model, logger });
      assert.equal(
        again.cleanupReport.items.find(
          (row) => row.indexName === 'chatGenerateStatus_1_updateTime_1'
        )?.action,
        'skip_missing'
      );
      assert.deepEqual(await model.collection.indexes(), after);
      c.record('真实索引重入', again);
    }
    c.record('真实索引同步', { variant, before, result, after, logs });
  }
  return context.itemId === 'C2'
    ? '当前索引建立后精确清理旧项目索引，自建索引保留，重复同步安全'
    : '同名不同 key 与缺失分别 skip_mismatch/skip_missing，当前/自建索引保留';
}
await runNodeCase('FG-INFRA-DATABASE-001', { C1: legacy, C2: indexes, C3: indexes });
