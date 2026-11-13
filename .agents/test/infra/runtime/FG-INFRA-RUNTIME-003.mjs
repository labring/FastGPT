import assert from 'node:assert/strict';
import { runNodeCase } from '../../support/runtime.mjs';
import { appKeyWorld } from '../../support/app-key.mjs';
import { success } from '../../support/scenario.mjs';
import {
  downloadSandboxFile,
  enableSandboxForApp,
  getInstanceClaimName,
  invokeSandboxService,
  uploadSandboxBytes
} from '../../support/sandbox-service.mjs';

/**
 * 验证 OpenSandbox 5 态生命周期、Volume-Manager 卷控制面、原地升级与孤儿卷 GC。
 */
async function execute(context) {
  const w = await appKeyWorld(context);
  const { c, W, Ka } = w;
  await enableSandboxForApp(w, context, W);

  const uid = c.run + '-' + context.itemId;
  const instancesCol = w.db.collection('agent_sandbox_instances_v3');

  if (context.itemId === 'C1') {
    const claimName = `fastgpt-session-fgtest-vol-${Date.now().toString(36)}`;
    const res = await invokeSandboxService(context, c, 'volume-manager-lifecycle', {
      claimName
    });
    assert.equal(res.firstEnsureStatus, 201, '首次 ensure 应返回 201 Created');
    assert.equal(res.secondEnsureStatus, 200, '重复 ensure 应返回 200 OK');
    assert.equal(res.inListBeforeRemove, true, '删除前卷应出现在 list 中');
    assert.equal(res.inListAfterRemove, false, '删除后卷应从 list 中移除');
    return 'Volume-Manager ensure(201/200)、list、unmount 与 remove 全链路验证通过';
  }

  if (context.itemId === 'C2') {
    const chat = await w.completion(Ka, W, { uid });
    const fileContent = 'gen1-' + uid;
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'lifecycle.txt'
        },
        content: fileContent
      })
    );

    const inst1 = await instancesCol.findOne({ sourceType: 'app', sourceId: W, userId: uid });
    assert.ok(inst1, '写入后必须创建沙箱实例');
    assert.equal(inst1.status, 'running');
    const claim1 = getInstanceClaimName(inst1);
    assert.ok(claim1, '必须绑定持久卷 claimName');

    // 1) Stop 沙箱：容器销毁但持久卷保留
    const stopRes = await invokeSandboxService(context, c, 'stop-sandbox', {
      sandboxId: inst1.sandboxId
    });
    assert.equal(stopRes.status, 'stopped');

    // 2) Resume 唤醒：再次读取自动唤醒，claimName 不变且文件保留
    const readAfterResume = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: chat.chatId,
        customUid: uid,
        path: 'lifecycle.txt'
      }
    });
    assert.equal(readAfterResume.error, false);
    assert.equal(readAfterResume.text, fileContent);

    const instAfterResume = await instancesCol.findOne({ sandboxId: inst1.sandboxId });
    assert.equal(instAfterResume?.status, 'running');
    assert.equal(getInstanceClaimName(instAfterResume), claim1);

    // 3) 彻底销毁（claimed -> providerDeleted -> volumeDeleted 三阶段游标）后重建
    const delRes = await invokeSandboxService(context, c, 'delete-sandbox', {
      sandboxId: inst1.sandboxId
    });
    assert.equal(delRes.deleted, true);

    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'recreated.txt'
        },
        content: 'gen2-' + uid
      })
    );

    const instAfterRecreate = await instancesCol.findOne({ sandboxId: inst1.sandboxId });
    assert.ok(instAfterRecreate);
    const claim2 = getInstanceClaimName(instAfterRecreate);
    assert.ok(claim2);
    assert.notEqual(claim2, claim1, '彻底销毁后重建必须生成包含新代际后缀的全新 claimName');

    const listAfterRecreate = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/list', {
        chatId: chat.chatId,
        customUid: uid,
        path: '.'
      })
    );
    const names = listAfterRecreate.entries.map((e) => e.name);
    assert.ok(names.includes('recreated.txt'));
    assert.ok(!names.includes('lifecycle.txt'), '彻底删除后重建不得复活旧持久卷中的文件');

    c.record('C2 生命周期与代际隔离', {
      sandboxId: inst1.sandboxId,
      claim1,
      claim2
    });
    return 'running -> stopped -> running 保留卷文件，delete -> recreate 推进代际卷名且不复活旧文件';
  }

  if (context.itemId === 'C3') {
    const chat = await w.completion(Ka, W, { uid });
    const marker = 'keep-across-upgrade-' + uid;
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'upgrade-keep.txt'
        },
        content: marker
      })
    );

    const upgradeRes = await invokeSandboxService(context, c, 'upgrade-sandbox', {
      sourceType: 'app',
      sourceId: W,
      userId: uid,
      chatId: chat.chatId
    });
    assert.equal(upgradeRes.upgraded, true);
    assert.equal(upgradeRes.statusAfterWake, 'running');
    assert.equal(upgradeRes.claimNameBefore, upgradeRes.claimNameAfter);

    const readAfterUpgrade = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: chat.chatId,
        customUid: uid,
        path: 'upgrade-keep.txt'
      }
    });
    assert.equal(readAfterUpgrade.error, false);
    assert.equal(readAfterUpgrade.text, marker);

    // 验证已废弃的 /api/core/ai/skill/runtime/{getStatus,upgrade} 返回 404
    const getStatusLegacy = await c.request({
      role: 'owner',
      kind: 'state',
      method: 'GET',
      route: '/api/core/ai/skill/runtime/getStatus'
    });
    const upgradeLegacy = await c.request({
      role: 'owner',
      kind: 'state',
      method: 'POST',
      route: '/api/core/ai/skill/runtime/upgrade',
      body: {}
    });
    assert.equal(getStatusLegacy.http, 404);
    assert.equal(upgradeLegacy.http, 404);

    return '原地升级镜像后 claimName 与卷文件完整保留，废弃的 skill/runtime/{getStatus,upgrade} 返回 404';
  }

  if (context.itemId === 'C4') {
    const chat = await w.completion(Ka, W, { uid });
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'gc-probe.txt'
        },
        content: 'gc'
      })
    );
    const inst = await instancesCol.findOne({ sourceType: 'app', sourceId: W, userId: uid });
    assert.ok(inst?.sandboxId);

    const orphanClaimName = `fastgpt-session-fgtest-orphan-${Date.now().toString(36)}`;
    const gcRes = await invokeSandboxService(context, c, 'stale-and-orphan-gc', {
      sandboxId: inst.sandboxId,
      orphanClaimName
    });
    assert.equal(gcRes.staleProvisionRolledBackTo, 'stopped');
    assert.equal(gcRes.orphanVolumeMarkedOnPass1, true);
    assert.equal(gcRes.orphanVolumeDeletedOnPass2, true);
    return '超时 provisioning 实例自动回滚为 stopped，孤儿卷首次扫描仅 Redis 打标、超 30m 宽限期二次扫描物理删除';
  }

  if (context.itemId === 'C5') {
    const chat = await w.completion(Ka, W, { uid });
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'cascade.txt'
        },
        content: 'cascade'
      })
    );
    const beforeCount = await instancesCol.countDocuments({ sourceType: 'app', sourceId: W });
    assert.ok(beforeCount >= 1);

    const cascadeRes = await invokeSandboxService(context, c, 'cascade-delete-source', {
      sourceType: 'app',
      sourceId: W
    });
    assert.equal(cascadeRes.remaining, 0);
    return '按 sourceId 级联删除后，Mongo 沙箱记录与对应持久卷全部清零';
  }
}

await runNodeCase(
  'FG-INFRA-RUNTIME-003',
  Object.fromEntries(['C1', 'C2', 'C3', 'C4', 'C5'].map((id) => [id, execute]))
);
