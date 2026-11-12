import assert from 'node:assert/strict';
import { runNodeCase, Blocked } from '../../support/runtime.mjs';
import { appKeyWorld, appKeyService, roles } from '../../support/app-key.mjs';
import { success } from '../../support/scenario.mjs';

/** API 入口验证独立授权和绑定边界；A3 的服务端认证开关矩阵另由服务集成执行。 */
async function execute(context) {
  const w = await appKeyWorld(context),
    { c, W, X, Ka, Kb } = w;
  await w.acl('A', W, roles.none);
  const fresh = (name) => w.label(name);
  switch (context.itemId) {
    case 'A1': {
      for (const version of ['v1', 'v2'])
        for (const stream of [false, true]) {
          const result = await w.completion(Ka, W, { version, stream });
          assert.equal(String(result.chats[0].tmbId), c.actor('A').tmbId);
          assert.equal(result.chats[0].outLinkUid, result.uid);
          assert.equal(result.chats[0].publishSource.type, 'api');
          assert.equal(String(result.chats[0].publishSource.id), Ka.id);
          const chatId = fresh('personal-rejected');
          await w.denied(
            await w.keyRequest(w.personal(), `/api/${version}/chat/completions`, {
              appId: W,
              chatId,
              stream,
              messages: [{ role: 'user', content: chatId }]
            })
          );
          const denied = await w.snapshot(W, [chatId]);
          assert.equal(denied.chats.length + denied.items.length + denied.logs.length, 0);
        }
      assert.equal(String((await w.keySnapshot([Ka.id]))[0].tmbId), c.actor('A').tmbId);
      return 'v1/v2 × JSON/SSE 均按 Key 授权；创建人无 W ACL，个人密钥拒绝且没有业务写入';
    }
    case 'A2': {
      const foreign = await w.foreignApp();
      const inputs = [
        { name: '同应用', body: { appId: W } },
        { name: '无 ID 无后缀', body: {} },
        { name: '正确后缀', suffix: W },
        { name: '正确 body 冲突后缀', body: { appId: W }, suffix: X },
        { name: '冲突 body 正确后缀', body: { appId: X }, suffix: W },
        { name: '其他应用 body', body: { appId: X } },
        { name: '跨团队 body', body: { appId: foreign.appId } },
        { name: '跨团队后缀', suffix: foreign.appId }
      ];
      for (const version of ['v1', 'v2'])
        for (const input of inputs) {
          const chatId = fresh('binding');
          const beforeX = await w.snapshot(X, [chatId]),
            beforeY = await w.snapshot(foreign.appId, [chatId]);
          await w.completion(Ka, W, {
            chatId,
            body: input.body,
            version,
            credential: Ka.value + (input.suffix ? '-' + input.suffix : '')
          });
          assert.deepEqual(await w.snapshot(X, [chatId]), beforeX);
          assert.deepEqual(await w.snapshot(foreign.appId, [chatId]), beforeY);
          c.record('绑定输入矩阵', { version, ...input });
        }
      // B 是普通成员，对 W/X 均有实际应用权限，验证个人密钥仍使用 body 优先。
      await w.completion(w.personal('B'), W, {
        body: { appId: W },
        credential: w.personal('B').value + '-' + X
      });
      return 'v1/v2 全部显式/省略/后缀冲突均执行 W；X/Y 零差集，个人密钥保留 body 优先';
    }
    case 'A3': {
      const personal = w.personal();
      const rows = await appKeyService(context, c, 'auth-flags', {
        keys: { app: Ka.value, personal: personal.value }
      });
      assert.equal(rows.length, 18);
      success(
        await c.request({
          role: 'owner',
          kind: 'state',
          method: 'PUT',
          route: '/api/core/app/update?appId=' + W,
          body: { name: (await w.db.collection('apps').findOne({ _id: w.oid(W) })).name }
        })
      );
      await w.denied(
        await w.keyRequest(
          Ka,
          '/api/core/app/update?appId=' + W,
          { name: w.keyName('forbidden'), authAppApiKey: true },
          'PUT'
        )
      );
      return '两类真实 Key × 显式/缺省开关在独立服务进程验证，HTTP 客户端不能伪造服务端开关';
    }
    case 'A4': {
      let { datasetId, skillId } = c.fixture.appKeys ?? {};
      if (!datasetId || !skillId) {
        const name = 'FG-TEST-' + fresh('resources');
        const resources = await appKeyService(context, c, 'prepare-resources', {
          name,
          teamId: String(w.teamId),
          tmbId: c.actor('owner').tmbId
        });
        ({ datasetId, skillId } = resources);
        context.cleanups.push(async () => {
          for (const [collection, id] of [
            [resources.datasetCollection, datasetId],
            [resources.skillCollection, skillId]
          ]) {
            const query = { _id: w.oid(id), teamId: w.teamId, name };
            assert.equal((await w.db.collection(collection).deleteOne(query)).deletedCount, 1);
          }
        });
        await w.acl('A', datasetId, roles.read, 'dataset');
      }
      // 正向调用使用 A 的真实个人身份，不借 root 证明输入合法。
      success(
        await c.request({
          role: 'A',
          kind: 'key',
          method: 'GET',
          route: '/api/core/dataset/detail?id=' + datasetId
        })
      );
      const appBefore = await w.db.collection('apps').findOne({ _id: w.oid(W) });
      success(
        await c.request({
          role: 'owner',
          kind: 'state',
          method: 'PUT',
          route: '/api/core/app/update?appId=' + W,
          body: { name: appBefore.name }
        })
      );
      const datasetBefore = await w.db
        .collection('datasets')
        .findOne({ _id: w.oid(datasetId), teamId: w.teamId });
      assert.ok(datasetBefore);
      for (const flags of [{}, { authAppApiKey: true }]) {
        await w.denied(
          await w.keyRequest(
            Ka,
            '/api/core/dataset/detail?' + new URLSearchParams({ id: datasetId, ...flags }),
            undefined,
            'GET'
          )
        );
        await w.denied(
          await w.keyRequest(
            Ka,
            '/api/core/app/update?appId=' + W,
            { name: fresh('forbidden'), ...flags },
            'PUT'
          )
        );
      }
      for (const target of [
        { skillId },
        { appId: W, sourceType: 'workflowBuilder' },
        { appId: W, sourceType: 'chatAgentHelper' }
      ]) {
        success(
          await c.request({
            role: 'owner',
            kind: 'state',
            route: '/api/core/chat/history/getHistories',
            body: target
          })
        );
        await w.denied(
          await w.keyRequest(Ka, '/api/core/chat/history/getHistories', {
            ...target,
            authAppApiKey: true
          })
        );
      }
      assert.deepEqual(
        await w.db.collection('datasets').findOne({ _id: w.oid(datasetId) }),
        datasetBefore
      );
      assert.equal((await w.db.collection('apps').findOne({ _id: w.oid(W) })).name, appBefore.name);
      return '真实知识库/应用/Skill/Builder/Helper 输入的正向访问成立，应用 Key 及伪造开关均拒绝，无配置写入';
    }
    case 'A5': {
      const first = await w.completion(Ka, W);
      await w.completion(Ka, W, { chatId: first.chatId, uid: first.uid, round: 2 });
      const last = await w.completion(Kb, W, { chatId: first.chatId, uid: first.uid, round: 3 });
      assert.equal(last.chats[0].outLinkUid, first.uid);
      // prepare/save 的既有规则记录最近鉴权成员；历史消息仍归属于各轮实际调用者。
      assert.equal(String(last.chats[0].tmbId), c.actor('B').tmbId);
      assert.ok(first.items.every((item) => String(item.tmbId) === c.actor('A').tmbId));
      assert.equal(
        last.items.filter((item) => String(item.tmbId) === c.actor('B').tmbId).length,
        2
      );
      assert.equal(last.chats[0].publishSource.type, 'api');
      assert.equal(String(last.chats[0].publishSource.id), Kb.id);
      assert.deepEqual(
        last.logs[0].publishSource,
        first.logs[0].publishSource,
        '统计桶保留首轮渠道'
      );
      for (const body of [
        { authProxy: { tmbId: c.actor('B').tmbId } },
        { authProxy: { tmbId: c.actor('B').tmbId }, customUid: first.uid }
      ]) {
        const chatId = fresh('proxy');
        const response = await w.keyRequest(Ka, '/api/v2/chat/completions', {
          chatId,
          stream: false,
          messages: [{ role: 'user', content: chatId }],
          ...body
        });
        if ('customUid' in body) await w.denied(response, true);
        else await w.denied(response);
        const rows = await w.snapshot(W, [chatId]);
        assert.equal(rows.chats.length + rows.items.length + rows.logs.length, 0);
      }
      return '同应用跨 Key 续聊成功；UID 不变、各轮消息保留实际鉴权成员，最近渠道更新，authProxy 单传及互斥组合均拒绝';
    }
    case 'A6': {
      const runtime = success(
        await c.request({
          role: 'owner',
          kind: 'anonymous',
          method: 'GET',
          route: '/api/common/system/getInitData'
        })
      );
      if (runtime.feConfigs?.isPlus !== true)
        throw new Blocked('当前 dev 未启用商业版，不能验证商业版有效期/额度限制');
      c.record('被测服务实际版本能力', { isPlus: runtime.feConfigs.isPlus });
      for (const mode of ['invalid', 'expired', 'over-quota', 'valid']) {
        const key =
          mode === 'invalid'
            ? { value: 'fastgpt-invalid-' + fresh('key') }
            : mode === 'valid'
              ? Ka
              : await w.createKey('B', W);
        if (mode === 'expired' || mode === 'over-quota')
          await w.db.collection('openapis').updateOne(
            { _id: w.oid(key.id) },
            {
              $set:
                mode === 'expired'
                  ? { 'limit.expiredTime': new Date(Date.now() - 60000) }
                  : { 'limit.maxUsagePoints': 1, usagePoints: 2 }
            }
          );
        const chatId = fresh(mode),
          response = await w.keyRequest(key, '/api/v2/chat/completions', {
            chatId,
            stream: false,
            messages: [{ role: 'user', content: chatId }]
          });
        const health = await w.keyRequest(key, '/api/support/openapi/health', undefined, 'GET');
        if (mode === 'valid') {
          success(response);
          assert.ok(response.text?.includes(chatId));
          assert.deepEqual(
            Object.fromEntries(
              Object.entries(success(health)).filter(([k]) =>
                ['valid', 'type', 'appId'].includes(k)
              )
            ),
            { valid: true, type: 'app', appId: W }
          );
        } else {
          for (const r of [response, health]) {
            if (mode === 'invalid') await w.denied(r);
            else {
              assert.equal(r.error, true);
              assert.match(
                JSON.stringify(r.json),
                mode === 'expired' ? /API Key is expired/ : /API Key is over usage/
              );
            }
          }
          const snap = await w.snapshot(W, [chatId]);
          assert.equal(snap.chats.length + snap.items.length + snap.logs.length, 0);
        }
        if (key.id && !['valid', 'invalid'].includes(mode))
          success(
            await c.request({
              role: 'B',
              kind: 'state',
              method: 'DELETE',
              route: '/api/support/openapi/delete?id=' + key.id
            })
          );
      }
      return '无效/过期/超额 Key 在 completions 和 health 均拒绝，有效 Key 返回自身绑定，拒绝变体零业务写入';
    }
  }
}
await runNodeCase(
  'FG-PERMISSION-RESOURCE-002',
  Object.fromEntries(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((id) => [id, execute]))
);
