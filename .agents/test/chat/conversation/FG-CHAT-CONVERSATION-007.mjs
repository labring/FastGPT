import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { runNodeCase } from '../../support/runtime.mjs';
import { appKeyWorld } from '../../support/app-key.mjs';
import { success, permissionDenied } from '../../support/scenario.mjs';
import {
  downloadSandboxFile,
  enableSandboxForApp,
  uploadSandboxBytes
} from '../../support/sandbox-service.mjs';

const req = createRequire(new URL('../../../../projects/app/package.json', import.meta.url));
const JSZip = req('jszip');

/**
 * 验证沙箱 IDE 文件系统 CRUD、统一 upload/download 原始字节流、oldEtag 乐观并发锁、大文件流式读取与多入口权限。
 */
async function execute(context) {
  const w = await appKeyWorld(context);
  const { c, W, Ka } = w;
  await enableSandboxForApp(w, context, W);

  const uid = c.run + '-' + context.itemId;

  if (context.itemId === 'C1') {
    const chat = await w.completion(Ka, W, { uid });

    // 1) mkdir 创建嵌套目录
    success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/mkdir', {
        chatId: chat.chatId,
        customUid: uid,
        path: 'src/utils'
      })
    );

    // 2) upload 写入代码文件并返回 etag
    const codeText = 'export const answer = 42;\n';
    const writeRes = success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'src/index.ts'
        },
        content: codeText
      })
    );
    assert.match(writeRes.etag ?? '', /^W\/"/);

    // 3) upload 二进制流上传
    const uploadPayload = Buffer.from('BINARY_ASSET_' + uid, 'utf8');
    const uploadRes = success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'assets/logo.bin'
        },
        content: uploadPayload
      })
    );
    assert.equal(uploadRes.path, 'assets/logo.bin');
    assert.equal(uploadRes.bytesWritten, uploadPayload.byteLength);

    // 4) list 单层列目录 (depth=1)
    const rootList = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/list', {
        chatId: chat.chatId,
        customUid: uid,
        path: '.'
      })
    );
    const rootNames = rootList.entries.map((e) => e.name);
    assert.ok(rootNames.includes('src') && rootNames.includes('assets'));

    // 5) download 读取单文件内容与 ETag 响应头
    const readRes = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: {
        chatId: chat.chatId,
        customUid: uid,
        path: 'src/index.ts'
      }
    });
    assert.equal(readRes.error, false);
    assert.equal(readRes.text, codeText);
    assert.equal(readRes.etag, writeRes.etag);

    // 6) move 重命名文件
    success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/move', {
        chatId: chat.chatId,
        customUid: uid,
        from: 'src/index.ts',
        to: 'src/main.ts'
      })
    );

    // 7) download 下载单文件与整个会话目录 ZIP
    const singleDl = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: { chatId: chat.chatId, customUid: uid, path: 'src/main.ts' }
    });
    assert.equal(singleDl.http, 200);
    assert.equal(singleDl.text, codeText);

    const dirDl = await c.request({
      role: 'A',
      kind: 'key',
      keyValue: Ka.value,
      route: '/api/core/ai/sandbox/download',
      body: { chatId: chat.chatId, customUid: uid, path: '.' },
      raw: true
    });
    assert.equal(dirDl.status, 200);
    const zip = await JSZip.loadAsync(Buffer.from(await dirDl.arrayBuffer()));
    assert.ok(zip.file('src/main.ts'), '目录 ZIP 应包含重命名后的 src/main.ts');
    assert.ok(zip.file('assets/logo.bin'), '目录 ZIP 应包含上传的 assets/logo.bin');
    assert.equal(await zip.file('assets/logo.bin').async('string'), 'BINARY_ASSET_' + uid);

    // 8) delete 删除文件并校验消失
    success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/delete', {
        chatId: chat.chatId,
        customUid: uid,
        path: 'src/main.ts'
      })
    );
    const srcListAfterDel = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/list', {
        chatId: chat.chatId,
        customUid: uid,
        path: 'src'
      })
    );
    assert.ok(!srcListAfterDel.entries.some((e) => e.name === 'main.ts'));

    // 9) 并发验证：在已就绪 App 沙箱发起新一轮对话的同时，并发点击展开右侧多层文件夹 (fs/list)、checkExist 与 download
    const instancesCol = w.db.collection('agent_sandbox_instances_v3');
    const instBeforeConcurrent = await instancesCol.findOne({
      sourceType: 'app',
      sourceId: W,
      userId: uid
    });
    assert.ok(instBeforeConcurrent?.instanceId);

    const [concurrentChat, ...concurrentFsResults] = await Promise.all([
      c.request({
        role: 'A',
        kind: 'key',
        keyValue: Ka.value,
        route: '/api/v1/chat/completions',
        body: {
          chatId: chat.chatId,
          customUid: uid,
          stream: false,
          detail: true,
          messages: [{ role: 'user', content: 'run second round while expanding folders' }]
        }
      }),
      ...['.', 'src', 'src/utils', 'assets'].map((folder) =>
        w.keyRequest(Ka, '/api/core/ai/sandbox/fs/list', {
          chatId: chat.chatId,
          customUid: uid,
          path: folder
        })
      ),
      w.keyRequest(Ka, '/api/core/ai/sandbox/checkExist', {
        chatId: chat.chatId,
        customUid: uid
      }),
      downloadSandboxFile(c, {
        kind: 'key',
        keyValue: Ka.value,
        body: { chatId: chat.chatId, customUid: uid, path: 'assets/logo.bin' }
      })
    ]);
    assert.equal(concurrentChat.error, false, '第二轮并发对话应成功完成');
    for (const fsRes of concurrentFsResults) {
      assert.equal(
        fsRes.error,
        false,
        `App 对话期间并发访问工作区接口失败: status=${fsRes.http}, statusText=${fsRes.json?.statusText}`
      );
    }
    const instAfterConcurrent = await instancesCol.findOne({
      sourceType: 'app',
      sourceId: W,
      userId: uid
    });
    assert.equal(
      instAfterConcurrent?.instanceId,
      instBeforeConcurrent.instanceId,
      'App 对话与右侧文件树并发展开期间不得销毁重建沙箱容器'
    );

    c.record('C1 IDE CRUD、上传下载与对话并发文件树闭环', {
      uploadedBytes: uploadRes.bytesWritten,
      zipFiles: Object.keys(zip.files),
      instanceId: instBeforeConcurrent.instanceId
    });
    return 'fs/{mkdir,list,move,delete}、统一 upload/download 单文件及 ZIP 打包与对话期间并发展开文件夹全链路通过';
  }

  if (context.itemId === 'C2') {
    const chat = await w.completion(Ka, W, { uid });

    // 1) oldEtag 乐观并发锁校验
    const writeV1 = success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'note.md'
        },
        content: 'v1-initial'
      })
    );
    const etag1 = writeV1.etag;
    assert.ok(etag1);

    // 模拟后台/Agent 修改了 note.md，产生新 etag2
    const writeV2 = success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'note.md'
        },
        content: 'v2-modified-by-agent-with-longer-size'
      })
    );
    const etag2 = writeV2.etag;
    assert.notEqual(etag1, etag2);

    // 携带过期 oldEtag: etag1 保存必须被冲突拦截且保留 v2 内容与零临时文件残留
    const staleWrite = await uploadSandboxBytes(c, {
      kind: 'key',
      keyValue: Ka.value,
      query: {
        chatId: chat.chatId,
        customUid: uid,
        path: 'note.md',
        oldEtag: etag1
      },
      content: 'stale-overwrite-attempt'
    });
    assert.equal(staleWrite.error, true, '过期 oldEtag 写入必须触发并发冲突拒绝');

    const readAfterStale = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: { chatId: chat.chatId, customUid: uid, path: 'note.md' }
    });
    assert.equal(readAfterStale.error, false);
    assert.equal(
      readAfterStale.text,
      'v2-modified-by-agent-with-longer-size',
      '并发冲突失败后必须保留 v2 原文件内容'
    );

    // 携带最新 oldEtag: etag2 保存成功
    const freshWrite = success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'note.md',
          oldEtag: etag2
        },
        content: 'v3-resolved'
      })
    );
    assert.match(freshWrite.etag ?? '', /^W\/"/);

    // 边界：超过单文件上限 (Content-Length > maxFileBytes) 写入必须被拒绝
    const oversizedWrite = await new Promise((resolve, reject) => {
      const targetUrl = new URL(
        `/api/core/ai/sandbox/upload?chatId=${encodeURIComponent(chat.chatId)}&customUid=${encodeURIComponent(uid)}&path=note.md`,
        c.fixture.baseUrl
      );
      const reqHttp = http.request(
        targetUrl,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${Ka.value}`,
            'content-type': 'application/octet-stream',
            'content-length': String(10 * 1024 * 1024 * 1024),
            connection: 'close'
          }
        },
        (res) => {
          let raw = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            reqHttp.destroy();
            const parsed = JSON.parse(raw);
            resolve({ http: res.statusCode, json: parsed, error: parsed.code !== 200 });
          });
        }
      );
      reqHttp.on('error', (err) => {
        if (err.code !== 'ECONNRESET') reject(err);
      });
      reqHttp.flushHeaders();
      reqHttp.write(Buffer.from('oversized-header-probe'));
    });
    assert.equal(oversizedWrite.error, true, '超过大小上限的上传请求必须被拒绝');

    // 边界：按 OpenSandbox 官方 moveFiles 行为，重命名到已存在的目标文件必须报错拒绝
    success(
      await uploadSandboxBytes(c, {
        kind: 'key',
        keyValue: Ka.value,
        query: {
          chatId: chat.chatId,
          customUid: uid,
          path: 'other-note.md'
        },
        content: 'other-content'
      })
    );
    const moveOverwriteRes = await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/move', {
      chatId: chat.chatId,
      customUid: uid,
      from: 'other-note.md',
      to: 'note.md'
    });
    assert.equal(moveOverwriteRes.error, true, '重命名覆盖已存在目标路径必须按官方行为报错拦截');

    // 边界：向已存在的目录路径执行 upload 写入必须报错，且空目录 download 返回合法空 ZIP
    success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/mkdir', {
        chatId: chat.chatId,
        customUid: uid,
        path: 'empty-dir'
      })
    );
    const writeOnDir = await uploadSandboxBytes(c, {
      kind: 'key',
      keyValue: Ka.value,
      query: {
        chatId: chat.chatId,
        customUid: uid,
        path: 'empty-dir'
      },
      content: 'cannot-overwrite-dir'
    });
    assert.equal(writeOnDir.error, true, '向已存在目录路径上传文件必须报错拦截');

    const emptyDirZipRes = await c.request({
      role: 'A',
      kind: 'key',
      keyValue: Ka.value,
      route: '/api/core/ai/sandbox/download',
      body: { chatId: chat.chatId, customUid: uid, path: 'empty-dir' },
      raw: true
    });
    assert.equal(emptyDirZipRes.status, 200, '空目录打包下载应返回 200');
    const emptyZip = await JSZip.loadAsync(Buffer.from(await emptyDirZipRes.arrayBuffer()));
    assert.equal(Object.keys(emptyZip.files).length, 0, '空目录 ZIP 不应包含任何文件条目');

    // 边界：下载不存在的文件必须返回错误
    const missingDl = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: { chatId: chat.chatId, customUid: uid, path: 'non-existent-file.txt' }
    });
    assert.equal(missingDl.error, true, '下载不存在文件必须返回错误');

    // 2) >5MB 大文件通过统一 download 流式读取完整返回原始字节与 ETag
    const sixMbBytes = 6 * 1024 * 1024;
    const execGen = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/fs/exec', {
        chatId: chat.chatId,
        customUid: uid,
        command: `head -c ${sixMbBytes} /dev/zero | tr '\\0' 'A' > large.bin`
      })
    );
    assert.equal(execGen.exitCode, 0);

    const streamDlLarge = await downloadSandboxFile(c, {
      kind: 'key',
      keyValue: Ka.value,
      body: { chatId: chat.chatId, customUid: uid, path: 'large.bin' }
    });
    assert.equal(streamDlLarge.http, 200);
    assert.equal(
      streamDlLarge.bytes.byteLength,
      sixMbBytes,
      'download 流式接口应完整读出 6MB 文件'
    );
    assert.match(streamDlLarge.etag ?? '', /^W\/"/);

    c.record('C2 乐观并发锁与 6MB 大文件流式读取', {
      etag1,
      etag2,
      staleWriteError: staleWrite.error,
      downloadedBytes: streamDlLarge.bytes.byteLength,
      largeEtag: streamDlLarge.etag
    });
    return '过期 oldEtag 触发并发冲突拦截、最新 etag 保存成功；6MB 文件通过统一流式 download 完整读取并返回 ETag';
  }

  if (context.itemId === 'C3') {
    // 1) App 登录态直接读写
    const webChatId = w.label('web-chat');
    success(
      await uploadSandboxBytes(c, {
        role: 'A',
        kind: 'state',
        query: {
          appId: W,
          chatId: webChatId,
          path: 'from-web.txt'
        },
        content: 'web-user-content'
      })
    );
    const webRead = await downloadSandboxFile(c, {
      role: 'A',
      kind: 'state',
      body: { appId: W, chatId: webChatId, path: 'from-web.txt' }
    });
    assert.equal(webRead.error, false);
    assert.equal(webRead.text, 'web-user-content');

    // 2) 免密分享链接 (outLinkAuthData) 访客只读允许、写接口全部拦截
    const shareId = success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/support/outLink/create',
        body: { appId: W, type: 'share', name: w.label('share'), allowAnonymous: true, app: {} }
      })
    );
    const shareUid = c.run + '-share-visitor';
    const shareChatId = w.label('share-chat');
    success(
      await c.request({
        role: 'owner',
        kind: 'anonymous',
        route: '/api/v2/chat/completions',
        body: {
          chatId: shareChatId,
          outLinkAuthData: { shareId, outLinkUid: shareUid },
          stream: false,
          messages: [{ role: 'user', content: 'hi share' }]
        }
      })
    );

    const shareList = success(
      await c.request({
        role: 'owner',
        kind: 'anonymous',
        route: '/api/core/ai/sandbox/fs/list',
        body: {
          appId: W,
          chatId: shareChatId,
          outLinkAuthData: { shareId, outLinkUid: shareUid },
          path: '.'
        }
      })
    );
    assert.ok(Array.isArray(shareList.entries));

    permissionDenied(
      await uploadSandboxBytes(c, {
        role: 'owner',
        kind: 'anonymous',
        query: {
          appId: W,
          chatId: shareChatId,
          outLinkAuthData: { shareId, outLinkUid: shareUid },
          path: 'x.txt'
        },
        content: 'x'
      })
    );

    for (const [writeRoute, extraBody] of [
      ['/api/core/ai/sandbox/fs/mkdir', { path: 'dir1' }],
      ['/api/core/ai/sandbox/fs/move', { from: 'a', to: 'b' }],
      ['/api/core/ai/sandbox/fs/delete', { path: 'x.txt' }],
      ['/api/core/ai/sandbox/fs/exec', { command: 'whoami' }]
    ]) {
      permissionDenied(
        await c.request({
          role: 'owner',
          kind: 'anonymous',
          route: writeRoute,
          body: {
            appId: W,
            chatId: shareChatId,
            outLinkAuthData: { shareId, outLinkUid: shareUid },
            ...extraBody
          }
        })
      );
    }

    c.record('C3 多入口读写与分享链接只读保护', {
      webChatId,
      shareChatId,
      shareListCount: shareList.entries.length
    });
    return 'App 登录态与 OpenAPI Key 读写正常，免密分享链接只读查看允许且全部 5 类写/执行接口被拦截';
  }
}

await runNodeCase(
  'FG-CHAT-CONVERSATION-007',
  Object.fromEntries(['C1', 'C2', 'C3'].map((id) => [id, execute]))
);
