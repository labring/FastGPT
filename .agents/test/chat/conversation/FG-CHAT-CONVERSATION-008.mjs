import assert from 'node:assert/strict';
import { runNodeCase } from '../../support/runtime.mjs';
import { appKeyWorld } from '../../support/app-key.mjs';
import { success } from '../../support/scenario.mjs';
import {
  enableSandboxForApp,
  invokeSandboxService,
  uploadSandboxBytes
} from '../../support/sandbox-service.mjs';

/**
 * 验证沙箱通用文件预览令牌签发、opensandbox-proxy 无 Cookie 代理读取、Byte Range 分片、安全响应头与边界防护。
 */
async function execute(context) {
  const w = await appKeyWorld(context);
  const { c, W, Ka } = w;
  await enableSandboxForApp(w, context, W);

  const uid = c.run + '-' + context.itemId;
  const htmlContent =
    '<!doctype html><html><head><script src="./app.js"></script></head><body><h1>Preview Ready</h1></body></html>';
  const jsContent = 'console.log("asset-loaded");\n';
  const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const mediaContent = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  async function seedPreviewFiles(chatId) {
    for (const [path, text] of [
      ['dist/index.html', htmlContent],
      ['dist/app.js', jsContent],
      ['dist/icon.svg', svgContent],
      ['dist/media.bin', mediaContent]
    ]) {
      success(
        await uploadSandboxBytes(c, {
          kind: 'key',
          keyValue: Ka.value,
          query: {
            chatId,
            customUid: uid,
            path
          },
          content: text
        })
      );
    }
  }

  function parsePreviewUrl(previewResultOrUrl, replaceSuffixPath) {
    const rawPreviewUrl =
      typeof previewResultOrUrl === 'string' ? previewResultOrUrl : previewResultOrUrl?.url;
    const parsed = new URL(rawPreviewUrl);
    const match = /^(.*)\/preview\/([^/]+)\/(.+)$/.exec(parsed.pathname);
    assert.ok(match, `预览 URL 路径格式不合法: ${parsed.pathname}`);
    const basePrefix = `${parsed.origin}${match[1]}`;
    const sessionId = match[2];
    assert.match(sessionId, /^[a-z][a-zA-Z0-9]{23}$/, 'sessionId 必须为 24 位随机令牌');
    const relPath = replaceSuffixPath ?? match[3];
    return {
      basePrefix,
      sessionId,
      relPath,
      url: `${basePrefix}/preview/${sessionId}/${relPath}`
    };
  }

  if (context.itemId === 'C1') {
    const chat = await w.completion(Ka, W, { uid });
    await seedPreviewFiles(chat.chatId);

    // 1) 不存在的文件与目录路径均应返回 400
    const missingRes = await w.keyRequest(Ka, '/api/core/ai/sandbox/getFilePreviewLink', {
      chatId: chat.chatId,
      customUid: uid,
      filePath: 'dist/not-found.html'
    });
    assert.equal(missingRes.error, true);
    assert.equal(missingRes.json?.code, 400);

    const dirPreviewRes = await w.keyRequest(Ka, '/api/core/ai/sandbox/getFilePreviewLink', {
      chatId: chat.chatId,
      customUid: uid,
      filePath: 'dist'
    });
    assert.equal(dirPreviewRes.error, true, '目录路径不得签发文件预览链接');
    assert.equal(dirPreviewRes.json?.code, 400);

    // 2) 通用文件（如 JS/媒体资源）支持签发预览链接并返回 expiresAt
    const nonHtmlPreview = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/getFilePreviewLink', {
        chatId: chat.chatId,
        customUid: uid,
        filePath: 'dist/app.js'
      })
    );
    assert.equal(typeof nonHtmlPreview.url, 'string');
    assert.ok(nonHtmlPreview.expiresAt > Date.now());

    // 3) 正常签发 dist/index.html 预览链接
    const rawPreviewUrl = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/getFilePreviewLink', {
        chatId: chat.chatId,
        customUid: uid,
        filePath: 'dist/index.html'
      })
    );
    assert.ok(rawPreviewUrl.expiresAt > Date.now());
    const { sessionId, url: htmlUrl, relPath } = parsePreviewUrl(rawPreviewUrl);

    // 4) 完全不带 Cookie / Authorization 匿名 GET & HEAD 读取 HTML 与同目录 JS 静态资源
    const htmlGet = await fetch(htmlUrl, { method: 'GET' });
    assert.equal(htmlGet.status, 200);
    assert.equal(await htmlGet.text(), htmlContent);

    const htmlHead = await fetch(htmlUrl, { method: 'HEAD' });
    assert.equal(htmlHead.status, 200);
    assert.equal(htmlHead.headers.get('content-length'), String(Buffer.byteLength(htmlContent)));

    const jsRelPath = relPath.replace(/index\.html$/, 'app.js');
    const { url: jsUrl } = parsePreviewUrl(rawPreviewUrl, jsRelPath);
    const jsGet = await fetch(jsUrl, { method: 'GET' });
    assert.equal(jsGet.status, 200);
    assert.equal(await jsGet.text(), jsContent);

    // 5) 尾斜杠目录自动补全 index.html 返回 200，不存在文件返回 404
    const dirTrailingSlash = relPath.replace(/index\.html$/, '');
    const { url: dirIndexUrl } = parsePreviewUrl(rawPreviewUrl, dirTrailingSlash);
    const dirIndexGet = await fetch(dirIndexUrl, { method: 'GET' });
    assert.equal(dirIndexGet.status, 200);
    assert.equal(await dirIndexGet.text(), htmlContent);

    const missingProxyRelPath = relPath.replace(/index\.html$/, 'not-found.txt');
    const { url: missingProxyUrl } = parsePreviewUrl(rawPreviewUrl, missingProxyRelPath);
    const missingProxyGet = await fetch(missingProxyUrl, { method: 'GET' });
    assert.equal(missingProxyGet.status, 404, '预览代理访问不存在文件应返回 404');

    c.record('C1 预览签发与无凭证代理加载', {
      sessionId,
      expiresAt: rawPreviewUrl.expiresAt,
      htmlStatus: htmlGet.status,
      jsStatus: jsGet.status,
      dirIndexStatus: dirIndexGet.status,
      missingProxyStatus: missingProxyGet.status
    });
    return '不存在文件或目录签发返回 400、预览代理缺失文件返回 404；有效通用文件与 HTML 签发 24 位 sessionId 及 expiresAt，匿名 GET/HEAD 成功加载 HTML、尾斜杠目录与同目录 JS 资源';
  }

  if (context.itemId === 'C2') {
    const chat = await w.completion(Ka, W, { uid });
    await seedPreviewFiles(chat.chatId);

    const rawPreviewUrl = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/getFilePreviewLink', {
        chatId: chat.chatId,
        customUid: uid,
        filePath: 'dist/index.html'
      })
    );
    const { relPath } = parsePreviewUrl(rawPreviewUrl);
    const mediaRelPath = relPath.replace(/index\.html$/, 'media.bin');
    const { url: mediaUrl } = parsePreviewUrl(rawPreviewUrl, mediaRelPath);

    // 1) 前 10 字节 Range: bytes=0-9
    const rangePrefix = await fetch(mediaUrl, {
      headers: { Range: 'bytes=0-9' }
    });
    assert.equal(rangePrefix.status, 206);
    assert.equal(rangePrefix.headers.get('content-range'), `bytes 0-9/${mediaContent.length}`);
    assert.equal(await rangePrefix.text(), '0123456789');

    // 2) 末尾 6 字节 Range: bytes=-6
    const rangeSuffix = await fetch(mediaUrl, {
      headers: { Range: 'bytes=-6' }
    });
    assert.equal(rangeSuffix.status, 206);
    assert.equal(await rangeSuffix.text(), 'UVWXYZ');

    // 3) 越界 Range: bytes=9999-10000 -> 416
    const rangeInvalid = await fetch(mediaUrl, {
      headers: { Range: 'bytes=9999-10000' }
    });
    assert.equal(rangeInvalid.status, 416);
    assert.equal(rangeInvalid.headers.get('content-range'), `bytes */${mediaContent.length}`);

    c.record('C2 Byte Range 分片响应', {
      prefixStatus: rangePrefix.status,
      suffixStatus: rangeSuffix.status,
      invalidStatus: rangeInvalid.status
    });
    return 'HTTP Range bytes=0-9 与 bytes=-6 精确返回 206 Partial Content，越界 Range 返回 416';
  }

  if (context.itemId === 'C3') {
    const chat = await w.completion(Ka, W, { uid });
    await seedPreviewFiles(chat.chatId);

    const rawPreviewUrl = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/getFilePreviewLink', {
        chatId: chat.chatId,
        customUid: uid,
        filePath: 'dist/index.html'
      })
    );
    const { url: htmlUrl, relPath } = parsePreviewUrl(rawPreviewUrl);
    const { url: svgUrl } = parsePreviewUrl(rawPreviewUrl, relPath.replace(/index\.html$/, 'icon.svg'));
    const { url: jsUrl } = parsePreviewUrl(rawPreviewUrl, relPath.replace(/index\.html$/, 'app.js'));

    // 1) HTML / SVG / JS 均下发严格不透明源 CSP 沙箱头（含 allow-scripts 但绝不含 allow-same-origin）
    for (const [targetUrl, expectedMimePrefix] of [
      [htmlUrl, 'text/html'],
      [svgUrl, 'image/svg+xml'],
      [jsUrl, 'text/javascript']
    ]) {
      const res = await fetch(targetUrl);
      assert.equal(res.status, 200);
      assert.ok((res.headers.get('content-type') ?? '').startsWith(expectedMimePrefix));
      const csp = res.headers.get('content-security-policy') ?? '';
      assert.match(csp, /sandbox\s+allow-scripts/);
      assert.equal(csp.includes('allow-same-origin'), false, 'CSP 绝不可包含 allow-same-origin');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(res.headers.get('cache-control'), 'private, no-store');
    }

    // 2) 非 GET/HEAD 方法（如 POST）返回 405
    const postRes = await fetch(htmlUrl, { method: 'POST' });
    assert.equal(postRes.status, 405);

    c.record('C3 安全头与方法限制', {
      csp: 'sandbox allow-scripts allow-forms allow-popups;',
      postStatus: postRes.status
    });
    return 'HTML/SVG/JS 均下发不含 allow-same-origin 的严格 CSP 沙箱头、nosniff 与 CORS 头，POST 请求返回 405';
  }

  if (context.itemId === 'C4') {
    const chat1 = await w.completion(Ka, W, { uid });
    await seedPreviewFiles(chat1.chatId);

    const rawPreviewUrl1 = success(
      await w.keyRequest(Ka, '/api/core/ai/sandbox/getFilePreviewLink', {
        chatId: chat1.chatId,
        customUid: uid,
        filePath: 'dist/index.html'
      })
    );
    const { basePrefix, sessionId } = parsePreviewUrl(rawPreviewUrl1);

    // 1) 非法格式的 sessionId 在边缘直接返回 400
    const badFormatRes = await fetch(
      `${basePrefix}/preview/invalid-token/sessions/${chat1.chatId}/dist/index.html`
    );
    assert.equal(badFormatRes.status, 400);

    // 2) 伪造不存在的 24 位 sessionId 返回 403
    const fakeSessionRes = await fetch(
      `${basePrefix}/preview/a12345678901234567890123/sessions/${chat1.chatId}/dist/index.html`
    );
    assert.equal(fakeSessionRes.status, 403);

    // 3) 词法路径边界校验：工作区外路径、内部隐藏目录与 .. 路径穿越在签发与边缘代理阶段均被拒绝
    for (const escapeFilePath of [
      '/etc/hosts',
      '../../../etc/hosts',
      '/workspace',
      '/workspace/.fastgpt/bun/bin/bun'
    ]) {
      const escapeSignRes = await w.keyRequest(Ka, '/api/core/ai/sandbox/getFilePreviewLink', {
        chatId: chat1.chatId,
        customUid: uid,
        filePath: escapeFilePath
      });
      assert.equal(escapeSignRes.error, true, `禁止为词法越界路径签发预览链接: ${escapeFilePath}`);
      assert.equal(escapeSignRes.json?.code, 403);
    }

    for (const [escapeRelSuffix, expectedStatus] of [
      [`%2e%2e/etc/hosts`, 400],
      [`dist%2f..%2fetc%2fhosts`, 403],
      [`dir%5cfile.txt`, 403],
      [`.fastgpt/bun/bin/bun`, 403]
    ]) {
      const escapeProxyRes = await fetch(`${basePrefix}/preview/${sessionId}/${escapeRelSuffix}`);
      assert.equal(
        escapeProxyRes.status,
        expectedStatus,
        `预览代理必须拦截词法越界路径: ${escapeRelSuffix}`
      );
    }

    // 4) 填充单沙箱活跃预览会话上限 (500) 后再次签发应触发 429
    await invokeSandboxService(context, c, 'seed-preview-session-limit', {
      appId: W,
      userId: uid,
      count: 500
    });
    context.itemFinalizers.push(() =>
      invokeSandboxService(context, c, 'clear-preview-session-limit', {
        appId: W,
        userId: uid
      })
    );
    const limitRes = await w.keyRequest(Ka, '/api/core/ai/sandbox/getFilePreviewLink', {
      chatId: chat1.chatId,
      customUid: uid,
      filePath: 'dist/index.html'
    });
    const hit429 = limitRes.json?.code === 429;
    assert.equal(hit429, true, '超过单沙箱最大活跃预览会话数 (500) 时应返回 429');

    c.record('C4 边缘令牌核验、路径穿越拦截与 429 速率限制', {
      badFormatStatus: badFormatRes.status,
      fakeSessionStatus: fakeSessionRes.status,
      hit429
    });
    return '非法格式令牌返回 400、伪造 24 位令牌返回 403、词法越界及内部运行时路径返回 400/403，超出单沙箱 500 个活跃链接上限返回 429';
  }
}

await runNodeCase(
  'FG-CHAT-CONVERSATION-008',
  Object.fromEntries(['C1', 'C2', 'C3', 'C4'].map((id) => [id, execute]))
);
