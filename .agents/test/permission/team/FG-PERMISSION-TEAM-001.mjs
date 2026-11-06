import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runNodeCase } from '../../support/runtime.mjs';
import { prepareDevEnvironment } from '../../support/environment.mjs';
import { appKeyWorld, appKeyService } from '../../support/app-key.mjs';
import { poll, required, success, permissionDenied } from '../../support/scenario.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');

/** 每个破坏性变体只新建团队/账号/应用资源，复用同一本地 dev 及已配置的服务。 */
async function world(context, variant, { ownApp = false } = {}) {
  const prepared = await prepareDevEnvironment({
    sourceEnv: required(context.fixture.devSourceEnv, 'devSourceEnv'),
    baseUrl: context.fixture.baseUrl
  });
  Object.assign(process.env, prepared.secrets);
  context.itemFinalizers.push(async () => {
    context.observations.push({ label: '本轮 dev 团队回收', value: await prepared.dispose() });
  });
  const scoped = { ...context, fixture: prepared.fixture };
  const w = await appKeyWorld(scoped);
  const { c, W, X } = w;
  async function transfer(appId, ownerRole, operator = 'owner') {
    success(
      await c.request({
        role: operator,
        kind: 'state',
        route: '/api/proApi/core/app/changeOwner',
        body: { appId, ownerId: c.actor(ownerRole).tmbId }
      })
    );
    assert.equal(
      String((await w.db.collection('apps').findOne({ _id: w.oid(appId) })).tmbId),
      c.actor(ownerRole).tmbId
    );
  }
  await transfer(W, 'B');
  await transfer(X, 'C');
  const Kx = await w.createKey('A', X);
  const personal = w.personal('A');
  const personalRow = await w.db.collection('openapis').findOne({ apiKey: personal.value });
  const keys = [w.Ka, Kx];
  let V, Kv;
  if (ownApp) {
    V = await w.app('subject-owned');
    await transfer(V, 'A');
    Kv = await w.createKey('A', V);
    keys.push(Kv);
  }
  c.record('交接变体基线', {
    variant,
    teamId: c.fixture.teamId,
    actors: Object.fromEntries(
      Object.entries(c.fixture.actors).map(([role, actor]) => [
        role,
        { tmbId: actor.tmbId, userId: actor.userId }
      ])
    ),
    W,
    X,
    V,
    keys: keys.map((key) => ({ id: key.id, appId: key.appId, tmbId: key.tmbId }))
  });
  return {
    ...w,
    scoped,
    prepared,
    transfer,
    Kx,
    otherOwnerKey: w.Kx,
    personal: { ...personal, id: String(personalRow._id) },
    keys,
    V,
    Kv
  };
}

/** 交接窗口不发业务请求，比较除归属外的全部 Key 字段及明文摘要。 */
async function keyState(w, keys) {
  return Promise.all(
    keys.map(async (key) => {
      const row = await w.db.collection('openapis').findOne({ _id: w.oid(key.id) });
      assert.ok(row);
      const { apiKey, ...metadata } = row;
      return { ...metadata, id: String(row._id), keyHash: sha(apiKey) };
    })
  );
}
async function assertHandover(w, before, expected) {
  const after = await keyState(
    w,
    before.map((row) => ({ id: row.id }))
  );
  for (let index = 0; index < before.length; index++) {
    const old = before[index],
      current = after[index];
    assert.equal(String(current.tmbId), expected[old.id] ?? String(old.tmbId));
    assert.deepEqual({ ...current, tmbId: undefined }, { ...old, tmbId: undefined });
  }
  w.c.record('Key 交接恒等核对', { before, after });
}
async function remove(w, role = 'A', leave = false) {
  success(
    await w.c.request({
      role: leave ? role : 'owner',
      kind: 'state',
      method: 'DELETE',
      route: leave
        ? '/api/proApi/support/user/team/member/leave'
        : '/api/proApi/support/user/team/member/delete?tmbId=' + w.c.actor(role).tmbId
    })
  );
  const member = await w.db
    .collection('team_members')
    .findOne({ _id: w.oid(w.c.actor(role).tmbId) });
  assert.equal(member.status, 'leave');
}
async function service(w, action, extra = {}) {
  return appKeyService(w.scoped, w.c, 'lifecycle', {
    action,
    memberId: w.c.actor('A').tmbId,
    ...extra
  });
}
async function personalDenied(w) {
  const chatId = w.label('personal-refused');
  const response = await w.c.request({
    kind: 'key',
    keyValue: w.personal.value,
    route: '/api/v2/chat/completions',
    body: {
      appId: w.W,
      chatId,
      messages: [{ role: 'user', content: 'probe' }],
      stream: false
    }
  });
  // getTmbInfoByTmbId 对离职成员返回该固定业务错误；不能接受任意 500。
  if (response.json?.message === 'member not exist') assert.equal(response.error, true);
  else permissionDenied(response);
  assert.equal(await w.db.collection('chats').countDocuments({ teamId: w.teamId, chatId }), 0);
}
/** 同时保存 customUid 和默认成员 UID 文件；复用后仍按原会话的文件归属读取。 */
async function historyFile(w, key, appId, defaultIdentity = false) {
  const uid = defaultIdentity ? w.c.actor('A').tmbId : w.label('visitor');
  const chat = await w.completion(key, appId, {
    uid,
    ...(defaultIdentity ? { body: { customUid: null } } : {})
  });
  const bytes = Buffer.from(w.label('handover-file') + '\n');
  const post = success(
    await w.keyRequest(key, '/api/core/chat/file/presignChatFilePostUrl', {
      chatId: chat.chatId,
      filename: 'FG-TEST.txt',
      contentType: 'text/plain',
      size: bytes.length
    })
  );
  w.scoped.secrets.add(post.url);
  const uploaded = await fetch(post.url, {
    method: 'PUT',
    headers: post.headers,
    body: bytes,
    signal: AbortSignal.timeout(30000)
  });
  assert.ok(uploaded.ok);
  const file = { key: post.key, chatId: chat.chatId, bytes, appId, credential: key };
  await readFileByKey(w, file);
  return { ...chat, file };
}
async function readFileByKey(w, file) {
  const url = success(
    await w.keyRequest(file.credential, '/api/core/chat/file/presignChatFileGetUrl', {
      chatId: file.chatId,
      key: file.key
    })
  );
  w.scoped.secrets.add(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  assert.equal(sha(Buffer.from(await response.arrayBuffer())), sha(file.bytes));
  const checks = w.scoped.resources.get('storage-check:' + file.appId) ?? [];
  checks.push(url);
  w.scoped.resources.set('storage-check:' + file.appId, checks);
  w.c.record('交接后真实文件核对', {
    appId: file.appId,
    chatId: file.chatId,
    key: file.key,
    sha256: sha(file.bytes)
  });
}
async function continued(w, key, appId, history) {
  const current = success(
    await w.keyRequest(
      key,
      '/api/core/chat/init?' + new URLSearchParams({ chatId: history.chatId }),
      undefined,
      'GET'
    )
  );
  assert.ok(current);
  await readFileByKey(w, history.file);
  await w.completion(key, appId, { chatId: history.chatId, uid: history.uid, round: 2 });
  const fresh = await w.completion(key, appId, { uid: w.label('new-user') });
  const storedKey = await w.db.collection('openapis').findOne({ _id: w.oid(key.id) });
  assert.equal(String(fresh.chats[0].tmbId), String(storedKey.tmbId));
}
async function immutableChats(w, histories) {
  const rows = await Promise.all(
    histories.map(({ chatId, file }) =>
      w.db
        .collection('chats')
        .findOne(
          { appId: w.oid(file.appId), chatId },
          { projection: { _id: 1, tmbId: 1, outLinkUid: 1 } }
        )
    )
  );
  return rows;
}

/** 按完整业务子场景执行；每个破坏性变体准备新资源，统一在 itemFinalizers 中收尾。 */
async function execute(context) {
  if (context.itemId === 'T1') {
    for (const leave of [false, true]) {
      const w = await world(context, leave ? '主动离开' : '管理员移出');
      const foreign = await w.foreignApp();
      const histories = [await historyFile(w, w.Ka, w.W), await historyFile(w, w.Kx, w.X, true)];
      const chats = await immutableChats(w, histories);
      const before = await keyState(w, [...w.keys, w.Kb, w.personal, foreign.key]);
      await remove(w, 'A', leave);
      await assertHandover(w, before, {
        [w.Ka.id]: w.c.actor('B').tmbId,
        [w.Kx.id]: w.c.actor('C').tmbId
      });
      assert.deepEqual(await immutableChats(w, histories), chats);
      await personalDenied(w);
      await continued(w, w.Ka, w.W, histories[0]);
      await continued(w, w.Kx, w.X, histories[1]);
    }
    return '移出与主动离开均按各应用 owner 交接；原 Key、旧历史、custom/default UID 文件继续可用，个人凭证失效';
  }
  if (context.itemId === 'T2') {
    for (const full of [false, true]) {
      const w = await world(context, full ? '接收人个人额度已满' : '应用 owner 离职', {
        ownApp: true
      });
      if (full)
        for (let index = 0; index < w.c.fixture.appKeys.maxKeyCount; index++)
          await w.createKey('owner');
      const histories = [];
      for (const key of w.keys) histories.push(await historyFile(w, key, key.appId));
      const chats = await immutableChats(w, histories);
      const before = await keyState(w, w.keys);
      await remove(w);
      assert.equal(
        String((await w.db.collection('apps').findOne({ _id: w.oid(w.V) })).tmbId),
        w.c.actor('owner').tmbId
      );
      await assertHandover(w, before, {
        [w.Ka.id]: w.c.actor('B').tmbId,
        [w.Kx.id]: w.c.actor('C').tmbId,
        [w.Kv.id]: w.c.actor('owner').tmbId
      });
      assert.deepEqual(await immutableChats(w, histories), chats);
      for (let index = 0; index < w.keys.length; index++)
        await continued(w, w.keys[index], w.keys[index].appId, histories[index]);
    }
    return '先转应用再转 Key，各应用目标正确；接收人个人额度已满仍可交接并复用原 Key';
  }
  if (context.itemId === 'T3') {
    const w = await world(context, '主动转让指定应用');
    const history = await historyFile(w, w.Kb, w.W);
    const stable = await keyState(w, [w.Ka, w.Kb, w.Kx, w.otherOwnerKey]);
    await w.transfer(w.W, 'M', 'B');
    await assertHandover(w, stable, { [w.Kb.id]: w.c.actor('M').tmbId });
    const value = success(
      await w.c.request({
        role: 'M',
        kind: 'state',
        route: '/api/support/openapi/copy',
        body: { id: w.Ka.id },
        metadataOnly: true
      })
    );
    context.secrets.add(value);
    assert.equal(value, w.Ka.value);
    await continued(w, w.Kb, w.W, history);
    return '只转移指定应用旧 owner 的 Key；其他管理员 Key 和其他应用 Key 不变，新 owner 可管理并复用原 Key';
  }
  if (context.itemId === 'T4') {
    const w = await world(context, '应用及文件夹删除');
    const foreign = await w.foreignApp();
    const control = await keyState(w, [w.Kx, w.personal, foreign.key]);
    await w.completion(w.Ka, w.W);
    success(
      await w.c.request({
        role: 'owner',
        kind: 'state',
        method: 'DELETE',
        route: '/api/core/app/del?appId=' + w.W
      })
    );
    const refused = await w.keyRequest(w.Ka, '/api/v2/chat/completions', {
      chatId: w.label('deleted'),
      messages: [{ role: 'user', content: 'probe' }],
      stream: false
    });
    assert.equal(refused.error, true);
    assert.ok(['appUnExist', 'unAuthApiKey'].includes(refused.json?.statusText));
    const folderName = 'FG-TEST-' + w.label('folder');
    success(
      await w.c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/app/folder/create',
        body: { name: folderName, type: 'folder' }
      })
    );
    const folder = await w.db.collection('apps').findOne({ teamId: w.teamId, name: folderName });
    assert.ok(folder);
    w.apps.set(String(folder._id), { teamId: w.teamId, role: 'owner' });
    const children = [];
    for (let index = 0; index < 2; index++) {
      const appId = await w.app('child-' + index);
      await w.db
        .collection('apps')
        .updateOne(
          { _id: w.oid(appId), teamId: w.teamId },
          { $set: { parentId: folder._id, ancestorIds: [folder._id] } }
        );
      children.push({ appId, key: await w.createKey('owner', appId) });
    }
    const deleted = success(
      await w.c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/app/batch/delete',
        body: { ids: [String(folder._id)] }
      })
    );
    assert.deepEqual(deleted.failedIds, []);
    for (const child of children) {
      assert.ok(deleted.affectedIds.includes(child.appId));
      const response = await w.keyRequest(child.key, '/api/v2/chat/completions', {
        messages: [{ role: 'user', content: 'probe' }],
        stream: false
      });
      assert.equal(response.error, true);
      assert.ok(['appUnExist', 'unAuthApiKey'].includes(response.json?.statusText));
    }
    await poll(async () => {
      assert.equal(
        await w.db
          .collection('openapis')
          .countDocuments({ appId: { $in: [w.W, ...children.map((row) => row.appId)] } }),
        0
      );
    }, 60000);
    await assertHandover(w, control, {});
    return '应用软删除即拒绝原 Key；文件夹批量删除覆盖子应用，绑定 Key 被清理且对照凭证不变';
  }
  if (context.itemId === 'T5') {
    const w = await world(context, '真实回滚与交接竞争', { ownApp: true });
    const before = await keyState(w, w.keys);
    await w.db
      .collection('team_members')
      .updateOne({ _id: w.oid(w.c.actor('B').tmbId) }, { $set: { status: 'leave' } });
    const rejected = await w.c.request({
      role: 'owner',
      kind: 'state',
      method: 'DELETE',
      route: '/api/proApi/support/user/team/member/delete?tmbId=' + w.c.actor('A').tmbId
    });
    assert.equal(rejected.error, true);
    assert.match(JSON.stringify(rejected.json), /Application Key owner is invalid/);
    assert.equal(
      String((await w.db.collection('apps').findOne({ _id: w.oid(w.V) })).tmbId),
      w.c.actor('A').tmbId
    );
    await assertHandover(w, before, {});
    await w.db
      .collection('team_members')
      .updateOne({ _id: w.oid(w.c.actor('B').tmbId) }, { $set: { status: 'active' } });
    await service(w, 'rollback-after-write');
    await assertHandover(w, before, {});
    await w.prepared.relogin('A');
    const late = await w.createKey('A', w.W);
    await service(w, 'create-under-lock', {
      baseUrl: w.c.fixture.baseUrl,
      stateFile: w.c.secret(w.c.actor('A').stateEnv),
      body: { type: 'app', appId: w.W, name: ('FG-TEST-' + w.label('during-lock')).slice(0, 50) }
    });
    await remove(w);
    const delayed = await w.c.request({
      role: 'A',
      kind: 'state',
      route: '/api/support/openapi/create',
      body: { type: 'app', appId: w.W, name: ('FG-TEST-' + w.label('after-leave')).slice(0, 50) }
    });
    permissionDenied(delayed);
    assert.equal(
      String((await w.db.collection('openapis').findOne({ _id: w.oid(late.id) })).tmbId),
      w.c.actor('B').tmbId
    );
    const race = await world(context, '应用转让与移出竞争');
    await service(race, 'race-owner-leave', { appId: race.W, newOwnerId: race.c.actor('M').tmbId });
    return '非法接收人和提交前真实故障均回滚 Mongo；创建前/占锁中/离职后边界正确，移出与转让竞争显式重试后归属收敛';
  }
  if (context.itemId === 'T6') {
    for (const transferResources of [true, false]) {
      const w = await world(context, transferResources ? '同步开启交接' : '同步关闭交接', {
        ownApp: true
      });
      const history = await historyFile(w, w.Ka, w.W);
      const before = await keyState(w, w.keys);
      const actors = Object.entries(w.c.fixture.actors).map(([role, actor]) => ({
        role,
        username: actor.username,
        memberName: actor.name
      }));
      await service(w, 'sync', {
        transferResources,
        latestUserList: actors
          .filter((actor) => actor.role !== 'A')
          .map(({ username, memberName }) => ({ username, memberName }))
      });
      await assertHandover(
        w,
        before,
        transferResources
          ? {
              [w.Ka.id]: w.c.actor('B').tmbId,
              [w.Kx.id]: w.c.actor('C').tmbId,
              [w.Kv.id]: w.c.actor('owner').tmbId
            }
          : {}
      );
      assert.equal(
        String((await w.db.collection('apps').findOne({ _id: w.oid(w.V) })).tmbId),
        w.c.actor(transferResources ? 'owner' : 'A').tmbId
      );
      const removed = await w.db
        .collection('team_members')
        .findOne({ _id: w.oid(w.c.actor('A').tmbId) });
      assert.equal(removed.status, 'leave');
      const stateAfterLeave = await keyState(w, w.keys);
      await readFileByKey(w, history.file);
      await w.completion(w.Ka, w.W, { uid: w.label('disabled-member') });
      await service(w, 'sync', {
        transferResources,
        latestUserList: actors.map(({ username, memberName }) => ({ username, memberName }))
      });
      assert.equal(
        (await w.db.collection('team_members').findOne({ _id: w.oid(w.c.actor('A').tmbId) }))
          .status,
        'active'
      );
      for (const key of w.keys)
        assert.equal(
          String((await w.db.collection('openapis').findOne({ _id: w.oid(key.id) })).tmbId),
          String(stateAfterLeave.find((row) => row.id === key.id).tmbId)
        );
    }
    return '真实同步服务覆盖开关开启/关闭及成员恢复；应用与 Key 同步交接，恢复不夺回，停用成员的有效应用 Key 仍可调用';
  }
  if (context.itemId === 'T7') {
    const w = await world(context, '非 owner 注销清理', { ownApp: true });
    const history = await historyFile(w, w.Ka, w.W);
    const before = await keyState(w, w.keys);
    const result = await service(w, 'cancel');
    assert.equal(result.cleanup.ownerTeams, 0);
    assert.equal(result.residual.complete, true);
    await assertHandover(w, before, {
      [w.Ka.id]: w.c.actor('B').tmbId,
      [w.Kx.id]: w.c.actor('C').tmbId,
      [w.Kv.id]: w.c.actor('owner').tmbId
    });
    assert.equal(
      await w.db.collection('openapis').countDocuments({ _id: w.oid(w.personal.id) }),
      0
    );
    await continued(w, w.Ka, w.W, history);
    const owned = await world(context, 'owner 团队删除');
    const ownerResult = await service(owned, 'cancel', { memberId: owned.c.actor('owner').tmbId });
    assert.equal(ownerResult.cleanup.ownerTeams, 1);
    assert.equal(ownerResult.residual.complete, true);
    await poll(
      async () =>
        assert.equal(
          await owned.db.collection('openapis').countDocuments({ teamId: owned.teamId }),
          0
        ),
      60000
    );
    return '真实注销清理服务先交接再清残留，原 Key 与旧文件仍可用；owner 团队删除回收全部 Key，不宣称覆盖完整注销等待链路';
  }
}

await runNodeCase(
  'FG-PERMISSION-TEAM-001',
  Object.fromEntries(Array.from({ length: 7 }, (_, index) => ['T' + (index + 1), execute]))
);
