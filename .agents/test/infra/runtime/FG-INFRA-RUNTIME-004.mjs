import assert from 'node:assert/strict';
import { runNodeCase } from '../../support/runtime.mjs';
import { appKeyWorld, roles } from '../../support/app-key.mjs';
import { success, permissionDenied } from '../../support/scenario.mjs';
import {
  downloadSandboxFile,
  enableSandboxForApp,
  getInstanceClaimName,
  uploadSandboxBytes
} from '../../support/sandbox-service.mjs';

/**
 * 验证 OpenSandbox FUSE 子目录隔离、零凭证泄露、跨用户隔离、路径穿越拦截与 checkExist 门禁。
 */
async function execute(context) {
  const w = await appKeyWorld(context);
  const { c, W, Ka } = w;
  await enableSandboxForApp(w, context, W);

  const uA = c.run + '-secA';
  const uB = c.run + '-secB';
  const secretMarker = 'TOP_SECRET_' + c.run;
  const instancesCol = w.db.collection('agent_sandbox_instances_v3');

  if (context.itemId === 'C1') {
    const chatA = await w.completion(Ka, W, { uid: uA });
    const chatB = await w.completion(Ka, W, { uid: uB });

    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chatA.chatId,
          customUid: uA,
          path: 'secret-a.txt'
        },
        content: secretMarker
      })
    );

    const instA = await instancesCol.findOne({ sourceType: 'app', sourceId: W, userId: uA });
    const claimA = getInstanceClaimName(instA);
    assert.ok(claimA);

    const probeCmd = [
      'ls -la /workspace/..',
      `ln -sf /workspace/.. escape_root && cat escape_root/${claimA}/sessions/${chatA.chatId}/secret-a.txt 2>/dev/null || echo "ESCAPE_BLOCKED"`
    ].join(' && ');

    const execB = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/exec', {
        chatId: chatB.chatId,
        customUid: uB,
        command: probeCmd
      })
    );
    assert.ok(execB.stdout.includes('ESCAPE_BLOCKED'), '软链接上溯宿主机兄弟卷目录必须被阻断');
    assert.ok(!execB.stdout.includes(secretMarker), '沙箱 B 不得读取沙箱 A 的机密内容');

    const instB = await instancesCol.findOne({ sourceType: 'app', sourceId: W, userId: uB });
    const claimB = getInstanceClaimName(instB);
    assert.ok(claimB);
    assert.notEqual(claimA, claimB);
    c.record('C1 FUSE 子目录与软链接逃逸隔离', {
      claimA,
      claimB
    });
    return 'FUSE --subdir 挂载下 /workspace/.. 指向容器自身根文件系统，软链接逃逸无法访问其他会话卷';
  }

  if (context.itemId === 'C2') {
    const chatA = await w.completion(Ka, W, { uid: uA });
    const credProbe = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/exec', {
        chatId: chatA.chatId,
        customUid: uA,
        command:
          'id -u && id -un && env && (tr "\\0" "\\n" < /proc/1/environ 2>/dev/null || true) && grep "/workspace" /proc/mounts'
      })
    );
    const lines = credProbe.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    assert.equal(lines[0], '10001', '沙箱进程必须以非特权 uid=10001 运行');
    assert.equal(lines[1], 'sandbox', '沙箱用户名必须为 sandbox');

    const forbiddenPatterns = [
      'META_URL=',
      'STORAGE_URL=',
      'ACCESS_KEY=',
      'SECRET_KEY=',
      'VOLUME_MANAGER_TOKEN',
      'MONGODB_URI'
    ];
    for (const pat of forbiddenPatterns) {
      assert.ok(!credProbe.stdout.includes(pat), `沙箱环境不得泄露敏感凭证标识: ${pat}`);
    }
    c.record('C2 零宿主凭证泄露与非特权运行', {
      uid: lines[0],
      user: lines[1],
      checkedForbiddenPatterns: forbiddenPatterns
    });
    return '沙箱以 uid=10001(sandbox) 非特权运行，env、/proc/1/environ 与 /proc/mounts 零宿主凭证泄露';
  }

  if (context.itemId === 'C3') {
    const chatA = await w.completion(Ka, W, { uid: uA });
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chatA.chatId,
          customUid: uA,
          path: 'secret-a.txt'
        },
        content: secretMarker
      })
    );

    // uB 尝试直接读取 chatA
    permissionDenied(
      await downloadSandboxFile(c, {
        kind: 'key',
        keyValue: Ka.value,
        body: {
          chatId: chatA.chatId,
          customUid: uB,
          path: 'secret-a.txt'
        }
      })
    );

    // 无权限成员 N 访问应用沙箱
    await w.acl('N', W, roles.none);
    permissionDenied(
      await c.request({
        role: 'N',
        kind: 'state',
        route: '/api/core/ai/sandbox/fs/list',
        body: { appId: W, chatId: chatA.chatId, path: '.' }
      })
    );

    c.record('C3 跨用户会话与未授权成员拦截', { chatId: chatA.chatId });
    return '跨用户访问他人会话与无权限成员访问私有应用沙箱均被拒绝';
  }

  if (context.itemId === 'C4') {
    const chatA = await w.completion(Ka, W, { uid: uA });
    const chatB = await w.completion(Ka, W, { uid: uB });
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chatA.chatId,
          customUid: uA,
          path: 'secret-a.txt'
        },
        content: secretMarker
      })
    );
    const instA = await instancesCol.findOne({ sourceType: 'app', sourceId: W, userId: uA });

    // uB 在请求体中伪造 sandboxId 指向 uA 的沙箱
    const forgedRead = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: chatB.chatId,
        customUid: uB,
        sandboxId: instA.sandboxId,
        path: 'secret-a.txt'
      }
    });
    assert.equal(forgedRead.error, true, '伪造他人 sandboxId 不得读到他人沙箱文件');

    // 路径穿越拦截校验
    const traversalWrite = await uploadSandboxBytes(c, {
      kind: 'key',
      keyValue: Ka.value,
      query: {
        chatId: chatA.chatId,
        customUid: uA,
        path: '../../etc/pwned'
      },
      content: 'hack'
    });
    assert.equal(traversalWrite.error, true, '路径穿越写入必须被拒绝');

    const traversalRead = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: chatA.chatId,
        customUid: uA,
        path: '../../etc/passwd'
      }
    });
    assert.equal(traversalRead.error, true, '路径穿越读取必须被拒绝');

    const rootDelete = await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/delete', {
      chatId: chatA.chatId,
      customUid: uA,
      path: '/workspace'
    });
    assert.equal(rootDelete.error, true, 'workspace 根目录删除必须被拒绝');

    // 全套根路径保护校验 (., /workspace, /) 覆盖 upload / mkdir / move / delete
    for (const rootCandidate of ['.', '/workspace', '/']) {
      const rootUpload = await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: { chatId: chatA.chatId, customUid: uA, path: rootCandidate },
        content: 'root-overwrite'
      });
      assert.equal(rootUpload.error, true, `禁止向根路径写入: ${rootCandidate}`);

      const rootMkdir = await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/mkdir', {
        chatId: chatA.chatId,
        customUid: uA,
        path: rootCandidate
      });
      assert.equal(rootMkdir.error, true, `禁止对根路径执行 mkdir: ${rootCandidate}`);

      const rootMoveFrom = await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/move', {
        chatId: chatA.chatId,
        customUid: uA,
        from: rootCandidate,
        to: 'moved-root'
      });
      assert.equal(rootMoveFrom.error, true, `禁止移动根路径: ${rootCandidate}`);

      const rootMoveTo = await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/move', {
        chatId: chatA.chatId,
        customUid: uA,
        from: 'secret-a.txt',
        to: rootCandidate
      });
      assert.equal(rootMoveTo.error, true, `禁止移动到根路径: ${rootCandidate}`);

      const rootDelCandidate = await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/delete', {
        chatId: chatA.chatId,
        customUid: uA,
        path: rootCandidate
      });
      assert.equal(rootDelCandidate.error, true, `禁止删除根路径: ${rootCandidate}`);
    }

    // 软链接指向目录时，deleteSandboxSessionEntry 仅解绑软链接本身（rm -f），不得递归破坏被指向的真实目录
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: { chatId: chatA.chatId, customUid: uA, path: 'real_dir/protected.txt' },
        content: 'KEEP_PROTECTED'
      })
    );
    success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/exec', {
        chatId: chatA.chatId,
        customUid: uA,
        command: 'ln -s real_dir sym_dir'
      })
    );
    const symDirDel = await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/delete', {
      chatId: chatA.chatId,
      customUid: uA,
      path: 'sym_dir'
    });
    assert.equal(symDirDel.error, false, '指向目录的软链接应仅解绑软链接本身并返回成功');
    const rootAfterUnlink = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/list', {
        chatId: chatA.chatId,
        customUid: uA,
        path: '.'
      })
    );
    assert.equal(
      rootAfterUnlink.entries.some((entry) => entry.name === 'sym_dir'),
      false,
      '软链接 sym_dir 解绑后应从目录列表中消失'
    );
    const protectedRead = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: { chatId: chatA.chatId, customUid: uA, path: 'real_dir/protected.txt' }
    });
    assert.equal(protectedRead.error, false, '真实目录内文件必须完好保留');
    assert.equal(protectedRead.text, 'KEEP_PROTECTED');

    // 容器内合法绝对路径（如 /tmp/...）允许读写，与 ../ 穿越严格区分
    const absTmpPath = `/tmp/fgtest-abs-${c.run}.txt`;
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: { chatId: chatA.chatId, customUid: uA, path: absTmpPath },
        content: 'abs-tmp-ok'
      })
    );
    const absTmpRead = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: { chatId: chatA.chatId, customUid: uA, path: absTmpPath }
    });
    assert.equal(absTmpRead.error, false);
    assert.equal(absTmpRead.text, 'abs-tmp-ok');

    c.record('C4 伪造 sandboxId 忽略、根路径保护与软链接安全删除', {
      forgedReadHttp: forgedRead.http,
      traversalWriteHttp: traversalWrite.http,
      traversalReadHttp: traversalRead.http,
      rootDeleteHttp: rootDelete.http,
      symlinkTargetPreserved: protectedRead.text === 'KEEP_PROTECTED',
      absTmpReadOk: absTmpRead.text === 'abs-tmp-ok'
    });
    return '服务端强派生 sandboxId 忽略客户端伪造值，所有 ../ 路径穿越与根路径误操作均被拦截，删除目录软链接不破坏真实目录';
  }

  if (context.itemId === 'C5') {
    const chatA = await w.completion(Ka, W, { uid: uA });
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chatA.chatId,
          customUid: uA,
          path: 'ready.txt'
        },
        content: 'ok'
      })
    );
    const checkExistA = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/checkExist', {
        chatId: chatA.chatId,
        customUid: uA
      })
    );
    assert.equal(checkExistA.exists, true);
    assert.equal(checkExistA.unavailableReason, undefined);

    // 关闭套餐 enableSandbox 后探测 checkExist 与 fs/list，验证返回 unavailableReason 且运行时访问被 403 阻断
    await w.db
      .collection('team_subscriptions')
      .updateOne({ teamId: w.teamId, type: 'standard' }, { $set: { enableSandbox: false } });
    const checkDisabled = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/checkExist', {
        chatId: chatA.chatId,
        customUid: uA
      })
    );
    assert.ok(checkDisabled.unavailableReason, '关闭套餐沙箱开关后应返回 unavailableReason');
    const disabledListRes = await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/list', {
      chatId: chatA.chatId,
      customUid: uA,
      path: '.'
    });
    assert.equal(disabledListRes.http, 403, '关闭套餐沙箱开关后运行时访问应返回 403');
    assert.equal(disabledListRes.json?.statusText, 'agentSandboxPermissionDenied');

    c.record('C5 checkExist 门禁与 unavailableReason', {
      whenEnabled: checkExistA,
      whenDisabled: checkDisabled
    });
    return '开启沙箱时 checkExist 返回 exists=true 且无 unavailableReason；关闭套餐开关时返回结构化 unavailableReason 且 fs/list 被拒绝';
  }
}

await runNodeCase(
  'FG-INFRA-RUNTIME-004',
  Object.fromEntries(['C1', 'C2', 'C3', 'C4', 'C5'].map((id) => [id, execute]))
);
