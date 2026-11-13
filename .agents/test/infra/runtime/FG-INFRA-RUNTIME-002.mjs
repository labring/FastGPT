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
 * 验证 customUid、默认成员、分享链接与后台会话恢复在直连沙箱文件接口中的使用者归属与隔离。
 */
async function execute(context) {
  const w = await appKeyWorld(context);
  const { c, W, Ka } = w;
  await enableSandboxForApp(w, context, W);

  const u1 = c.run + '-u1';
  const u2 = c.run + '-u2';

  if (context.itemId === 'C1') {
    const first = await w.completion(Ka, W, { uid: u1 });
    const markerPath = 'RUN-marker.txt';
    const writeRes = success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: first.chatId,
          customUid: u1,
          path: markerPath
        },
        content: u1
      })
    );
    assert.match(writeRes.etag ?? '', /^W\/"/);

    const existRes = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/checkExist', {
        chatId: first.chatId,
        customUid: u1
      })
    );
    assert.equal(existRes.exists, true);
    assert.equal(existRes.unavailableReason, undefined);

    const listRes = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/list', {
        chatId: first.chatId,
        customUid: u1,
        path: '.'
      })
    );
    assert.ok(listRes.entries.some((entry) => entry.name === markerPath && entry.type === 'file'));

    const readRes = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: first.chatId,
        customUid: u1,
        path: markerPath
      }
    });
    assert.equal(readRes.error, false);
    assert.equal(readRes.text, u1);
    assert.equal(readRes.etag, writeRes.etag);

    // 校验旧版 HTML 预览接口已下线、内部代理接口强制密钥校验、普通 App 会话禁止签发终端 Ticket
    const legacyHtmlPreview = await w.keyRequest(
      Ka,
      '/api/core/ai/sandbox/getHtmlPreviewLink',
      {
        chatId: first.chatId,
        customUid: u1,
        filePath: markerPath
      }
    );
    assert.equal(legacyHtmlPreview.http, 404, '旧接口 getHtmlPreviewLink 应返回 404');

    const appTicketAttempt = await w.keyRequest(Ka, '/api/core/ai/sandbox/getTicket', {
      chatId: first.chatId,
      customUid: u1
    });
    assert.equal(appTicketAttempt.error, true, '普通 App 会话不得签发终端 Ticket');

    const unauthKeepalive = await w.keyRequest(Ka, '/api/core/ai/sandbox/keepalive', {
      sandboxIds: ['app-0123456789abcdef']
    });
    assert.equal(unauthKeepalive.http, 401, '缺少代理密钥调用 keepalive 应返回 401');

    const instances = await w.db
      .collection('agent_sandbox_instances_v3')
      .find({ sourceType: 'app', sourceId: W, userId: u1 })
      .toArray();
    assert.equal(instances.length, 1);
    assert.equal(instances[0].userId, u1);
    assert.equal(instances[0].status, 'running');
    const claimName = getInstanceClaimName(instances[0]);
    assert.match(claimName ?? '', /^fastgpt-/);
    c.record('C1 沙箱实例与文件归属', {
      sandboxId: instances[0].sandboxId,
      userId: instances[0].userId,
      claimName,
      etag: readRes.etag
    });
    return 'customUid=RUN-u1 的会话、沙箱实例与实际文件内容一致，直连文件接口正常读写且路由边界校验生效';
  }

  if (context.itemId === 'C2') {
    const chatU1 = await w.completion(Ka, W, { uid: u1 });
    const chatU2 = await w.completion(Ka, W, { uid: u2 });

    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chatU1.chatId,
          customUid: u1,
          path: 'owner.txt'
        },
        content: 'belong-to-' + u1
      })
    );
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chatU2.chatId,
          customUid: u2,
          path: 'owner.txt'
        },
        content: 'belong-to-' + u2
      })
    );

    const readU1 = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: chatU1.chatId,
        customUid: u1,
        path: 'owner.txt'
      }
    });
    const readU2 = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: chatU2.chatId,
        customUid: u2,
        path: 'owner.txt'
      }
    });
    assert.equal(readU1.error, false);
    assert.equal(readU2.error, false);
    assert.equal(readU1.text, 'belong-to-' + u1);
    assert.equal(readU2.text, 'belong-to-' + u2);

    // 交叉 UID 访问对方 chatId 必须被鉴权拒绝
    permissionDenied(
      await downloadSandboxFile(c, {
        kind: 'key',
        keyValue: Ka.value,
        body: {
          chatId: chatU1.chatId,
          customUid: u2,
          path: 'owner.txt'
        }
      })
    );

    const instances = await w.db
      .collection('agent_sandbox_instances_v3')
      .find({ sourceType: 'app', sourceId: W, userId: { $in: [u1, u2] } })
      .toArray();
    assert.equal(instances.length, 2);
    assert.notEqual(instances[0].sandboxId, instances[1].sandboxId);
    const claim0 = getInstanceClaimName(instances[0]);
    const claim1 = getInstanceClaimName(instances[1]);
    assert.ok(claim0 && claim1);
    assert.notEqual(claim0, claim1);
    c.record('C2 跨 customUid 实例与卷隔离', {
      instances: instances.map((i) => ({
        userId: i.userId,
        sandboxId: i.sandboxId,
        claimName: getInstanceClaimName(i)
      }))
    });
    return 'u1 与 u2 拥有各自独立的 sandboxId 与持久卷 claimName，文件内容互不串用且交叉 UID 访问被拒绝';
  }

  if (context.itemId === 'C3') {
    const chat1 = await w.completion(Ka, W, { uid: u1 });
    const chat2 = await w.completion(Ka, W, { uid: u1 });
    assert.notEqual(chat1.chatId, chat2.chatId);

    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat1.chatId,
          customUid: u1,
          path: 'session-only.txt'
        },
        content: 'chat1-' + chat1.chatId
      })
    );
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat2.chatId,
          customUid: u1,
          path: 'session-only.txt'
        },
        content: 'chat2-' + chat2.chatId
      })
    );

    const read1 = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: chat1.chatId,
        customUid: u1,
        path: 'session-only.txt'
      }
    });
    const read2 = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: chat2.chatId,
        customUid: u1,
        path: 'session-only.txt'
      }
    });
    assert.equal(read1.error, false);
    assert.equal(read2.error, false);
    assert.equal(read1.text, 'chat1-' + chat1.chatId);
    assert.equal(read2.text, 'chat2-' + chat2.chatId);

    const instances = await w.db
      .collection('agent_sandbox_instances_v3')
      .find({ sourceType: 'app', sourceId: W, userId: u1 })
      .toArray();
    assert.equal(instances.length, 1);
    c.record('C3 同用户多 chatId 复用实例与目录隔离', {
      sandboxId: instances[0].sandboxId,
      claimName: getInstanceClaimName(instances[0]),
      chatIds: [chat1.chatId, chat2.chatId]
    });
    return '同一 customUid 在不同 chatId 下复用同一个 sandboxId 与持久卷，且各自位于独立的 /workspace/sessions/<chatId> 目录';
  }

  if (context.itemId === 'C4') {
    const aTmbId = c.actor('A').tmbId;
    const defaultChatId = w.label('default-chat');
    const question = w.label('default-q');
    // 省略 customUid 调用 completions
    const comp = await c.request({
      role: 'A',
      kind: 'key',
      keyValue: Ka.value,
      route: '/api/v1/chat/completions',
      body: {
        chatId: defaultChatId,
        messages: [{ role: 'user', content: question }],
        stream: false,
        detail: true
      }
    });
    success(comp);

    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: defaultChatId,
          path: 'member.txt'
        },
        content: 'member-' + aTmbId
      })
    );

    // 登录态（Cookie）若恶意传入 customUid 必须被拒绝（不接受登录态伪造外部 UID）
    const cookieWithCustomUid = await c.request({
      role: 'A',
      kind: 'state',
      route: '/api/core/ai/sandbox/fs/list',
      body: {
        appId: W,
        chatId: defaultChatId,
        customUid: u1,
        path: '.'
      }
    });
    assert.equal(cookieWithCustomUid.error, true);

    const instances = await w.db
      .collection('agent_sandbox_instances_v3')
      .find({ sourceType: 'app', sourceId: W, userId: aTmbId })
      .toArray();
    assert.equal(instances.length, 1);
    assert.equal(instances[0].userId, aTmbId);
    c.record('C4 默认成员归属与登录态防伪造', {
      userId: instances[0].userId,
      sandboxId: instances[0].sandboxId
    });
    return '省略 customUid 时沙箱 userId 回退为 A.tmbId，且登录态携带 customUid 被拒绝';
  }

  if (context.itemId === 'C5') {
    const chatU1 = await w.completion(Ka, W, { uid: u1 });
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chatU1.chatId,
          customUid: u1,
          path: 'u1-artifact.txt'
        },
        content: 'artifact-of-' + u1
      })
    );

    // 1) 无 W 权限的成员 N 请求 C1 的 checkExist / fs/list / download 必须被拒绝
    await w.acl('N', W, roles.none);
    for (const [route, body] of [
      ['/api/core/ai/sandbox/checkExist', { appId: W, chatId: chatU1.chatId }],
      ['/api/core/ai/sandbox/fs/list', { appId: W, chatId: chatU1.chatId, path: '.' }],
      [
        '/api/core/ai/sandbox/download',
        { appId: W, chatId: chatU1.chatId, path: 'u1-artifact.txt' }
      ]
    ]) {
      permissionDenied(
        await c.request({
          role: 'N',
          kind: 'state',
          route,
          body
        })
      );
    }

    // 2) 免密分享链接（outLinkAuthData）访客只能读取自己的沙箱文件，写操作（upload、fs/mkdir 等）被 WritePermissionVal 拒绝
    const shareId = success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/support/outLink/create',
        body: { appId: W, type: 'share', name: w.label('share'), allowAnonymous: true, app: {} }
      })
    );
    const shareGuestUid = c.run + '-share-guest';
    const shareChatId = w.label('share-chat');
    success(
      await c.request({
        role: 'owner',
        kind: 'anonymous',
        route: '/api/v2/chat/completions',
        body: {
          chatId: shareChatId,
          outLinkAuthData: { shareId, outLinkUid: shareGuestUid },
          stream: false,
          messages: [{ role: 'user', content: 'hello share' }]
        }
      })
    );
    const shareWriteAttempt = await uploadSandboxBytes(c, {
      role: 'owner',
      kind: 'anonymous',
      query: {
        appId: W,
        chatId: shareChatId,
        outLinkAuthData: { shareId, outLinkUid: shareGuestUid },
        path: 'hack.txt'
      },
      content: 'nope'
    });
    permissionDenied(shareWriteAttempt);

    // 3) 有日志/管理权限的成员 B（或 owner）在后台查看 C1 会话时，自动从 chat.outLinkUid 恢复 RUN-u1 的沙箱文件，而非回退到 B.tmbId
    const adminRead = await downloadSandboxFile(c, {
      role: 'B',
      kind: 'state',
      body: {
        appId: W,
        chatId: chatU1.chatId,
        path: 'u1-artifact.txt'
      }
    });
    assert.equal(adminRead.error, false);
    assert.equal(adminRead.text, 'artifact-of-' + u1);
    c.record('C5 权限拒绝、分享链接只读防写与管理员恢复访客沙箱', {
      recoveredChatId: chatU1.chatId,
      recoveredContent: 'artifact-of-' + u1,
      shareWriteDenied: shareWriteAttempt.http
    });
    return '无权限成员及分享链接写请求均被拒绝；有权限成员查看历史会话时从 chat.outLinkUid 准确恢复 RUN-u1 沙箱文件';
  }
}

await runNodeCase(
  'FG-INFRA-RUNTIME-002',
  Object.fromEntries(['C1', 'C2', 'C3', 'C4', 'C5'].map((id) => [id, execute]))
);
