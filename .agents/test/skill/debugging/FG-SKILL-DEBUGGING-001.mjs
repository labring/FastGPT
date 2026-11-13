import assert from 'node:assert/strict';
import { runNodeCase } from '../../support/runtime.mjs';
import { appKeyWorld, roles } from '../../support/app-key.mjs';
import { success } from '../../support/scenario.mjs';
import {
  downloadSandboxFile,
  enableSandboxForApp,
  getInstanceClaimName,
  invokeSandboxService,
  uploadSandboxBytes
} from '../../support/sandbox-service.mjs';

const SKILL_CHAT_ID = 'edit-debug';
const EXECD_PTY_BIN_STDIN = 0x00;
const EXECD_PTY_BIN_STDOUT = 0x01;
const EXECD_PTY_BIN_STDERR = 0x02;
const EXECD_PTY_BIN_REPLAY = 0x03;

/**
 * 申请短期终端 Ticket 并通过原生 WebSocket 直连 opensandbox-proxy `/terminal`，
 * 收发 OpenSandbox `execd` 二进制帧（`0x00~0x03`）与 JSON 控制帧直至匹配目标文本。
 */
async function runPtyInteraction({
  c,
  skillId,
  since,
  onConnected,
  waitForText,
  timeoutMs = 20_000
}) {
  const ticketInfo = success(
    await c.request({
      role: 'owner',
      kind: 'state',
      route: '/api/core/ai/sandbox/getTicket',
      body: {
        skillId,
        chatId: SKILL_CHAT_ID,
        cols: 80,
        rows: 24
      }
    })
  );
  assert.equal(typeof ticketInfo.ticket, 'string');
  assert.equal(typeof ticketInfo.url, 'string');
  assert.ok(ticketInfo.ptySessionId);

  const wsUrl = new URL(ticketInfo.url, c.fixture.baseUrl);
  wsUrl.searchParams.set('ticket', ticketInfo.ticket);
  if (typeof since === 'number' && since > 0) {
    wsUrl.searchParams.set('since', String(since));
  }

  let combinedOutput = '';
  let lastOffset = ticketInfo.reused === false ? 0 : (since ?? 0);

  return await new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(wsUrl.toString());
    ws.binaryType = 'arraybuffer';

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Done');
        }
      } catch {}
      if (err) {
        reject(err);
      } else {
        resolve({
          ptySessionId: ticketInfo.ptySessionId,
          reused: ticketInfo.reused,
          terminalUrl: ticketInfo.url,
          combinedOutput,
          lastOffset
        });
      }
    };

    const timer = setTimeout(() => {
      finish(
        new Error(
          `PTY WebSocket 等待输出超时 (${timeoutMs}ms)，当前输出: ${JSON.stringify(combinedOutput)}`
        )
      );
    }, timeoutMs);

    const sendStdin = (text) => {
      const payload = Buffer.from(text, 'utf8');
      const frame = new Uint8Array(1 + payload.byteLength);
      frame[0] = EXECD_PTY_BIN_STDIN;
      frame.set(payload, 1);
      ws.send(frame);
    };

    const sendControl = (controlPayload) => {
      ws.send(JSON.stringify(controlPayload));
    };

    let connectedCallbackFired = false;
    const triggerConnected = () => {
      if (connectedCallbackFired || settled || !onConnected) return;
      connectedCallbackFired = true;
      Promise.resolve(
        onConnected({
          ptySessionId: ticketInfo.ptySessionId,
          reused: ticketInfo.reused,
          sendStdin,
          sendControl
        })
      ).catch(finish);
    };

    ws.addEventListener('open', () => {
      // 复用已有活跃 bash 会话时可直接下发交互帧；新建会话需等待首个 bash 提示符字节到达，避免 SIGINT 早于交互式 bash 安装信号处理器。
      if (ticketInfo.reused !== false) {
        triggerConnected();
      }
    });

    ws.addEventListener('message', (event) => {
      if (settled) return;
      if (event.data instanceof ArrayBuffer) {
        const bytes = new Uint8Array(event.data);
        if (bytes.byteLength === 0) return;
        const tag = bytes[0];
        if (tag === EXECD_PTY_BIN_STDOUT || tag === EXECD_PTY_BIN_STDERR) {
          const payload = bytes.subarray(1);
          lastOffset += payload.byteLength;
          combinedOutput += Buffer.from(payload).toString('utf8');
        } else if (tag === EXECD_PTY_BIN_REPLAY && bytes.byteLength >= 9) {
          const view = new DataView(bytes.buffer, bytes.byteOffset + 1, 8);
          const replayStart = Number(view.getBigUint64(0, false));
          const payload = bytes.subarray(9);
          lastOffset = replayStart + payload.byteLength;
          combinedOutput += Buffer.from(payload).toString('utf8');
        }
        if (!connectedCallbackFired && combinedOutput.length > 0) {
          triggerConnected();
        }
        if (waitForText && combinedOutput.includes(waitForText)) {
          finish();
        }
        return;
      }

      if (typeof event.data === 'string') {
        let frame;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }
        if (frame?.type === 'offset' && typeof frame.offset === 'number' && frame.offset >= 0) {
          lastOffset = frame.offset;
        } else if (frame?.type === 'error') {
          finish(new Error(`PTY WebSocket error: ${frame.error ?? 'unknown'}`));
        }
      }
    });

    ws.addEventListener('error', () => {
      if (!settled && !(waitForText && combinedOutput.includes(waitForText))) {
        finish(new Error('PTY WebSocket connection error'));
      }
    });

    ws.addEventListener('close', (event) => {
      if (!settled) {
        if (waitForText && !combinedOutput.includes(waitForText)) {
          finish(
            new Error(`PTY WebSocket 提前关闭 (code=${event.code}, reason=${event.reason || ''})`)
          );
        } else {
          finish();
        }
      }
    });
  });
}

/**
 * 验证 Skill Edit 沙箱冷热启动、IDE 文件读写与交互式原生 WebSocket PTY 终端。
 */
async function execute(context) {
  const w = await appKeyWorld(context);
  const { c, W } = w;
  await enableSandboxForApp(w, context, W);

  const skillName = `fg-skill-dbg-${c.run}-${context.itemId}`.slice(0, 48);
  const created = await invokeSandboxService(context, c, 'create-skill-fixture', {
    skillName,
    tmbId: c.actor('owner').tmbId
  });
  const skillId = created.skillId;
  context.itemFinalizers.push(() =>
    invokeSandboxService(context, c, 'cleanup-skill-fixture', { skillId })
  );

  const instancesCol = w.db.collection('agent_sandbox_instances_v3');

  if (context.itemId === 'C1') {
    // 1) 冷启动初始化
    const coldInit = await c.request({
      role: 'owner',
      kind: 'state',
      route: '/api/core/ai/skill/runtime/init',
      body: { skillId }
    });
    assert.equal(coldInit.http, 200);
    assert.equal(coldInit.error, false);
    assert.ok(
      coldInit.events.some((e) => e.event === 'sandboxStatus' && e.data?.phase === 'ready'),
      '冷启动应推送 phase=ready 的 sandboxStatus SSE 事件'
    );

    const instCold = await instancesCol.findOne({ sourceType: 'skillEdit', sourceId: skillId });
    assert.ok(instCold);
    assert.equal(instCold.status, 'running');
    const coldClaim = getInstanceClaimName(instCold);
    assert.match(coldClaim ?? '', /^fastgpt-/);

    // 2) 热启动再次调用 init，验证复用同一实例与持久卷
    const warmInit = await c.request({
      role: 'owner',
      kind: 'state',
      route: '/api/core/ai/skill/runtime/init',
      body: { skillId }
    });
    assert.equal(warmInit.http, 200);
    assert.equal(warmInit.error, false);

    const instWarm = await instancesCol.findOne({ sourceType: 'skillEdit', sourceId: skillId });
    assert.equal(instWarm?.sandboxId, instCold.sandboxId);
    assert.equal(
      instWarm?.instanceId,
      instCold.instanceId,
      '热启动不得销毁重建已运行容器 instanceId'
    );
    assert.equal(getInstanceClaimName(instWarm), coldClaim);

    c.record('C1 Skill 沙箱冷热启动', {
      skillId,
      sandboxId: instCold.sandboxId,
      instanceId: instCold.instanceId,
      image: instCold.image,
      claimName: coldClaim,
      coldEventPhases: coldInit.events.map((e) => e.data?.phase)
    });
    return 'Skill Edit 沙箱冷启动解压包并推送 ready 事件，热启动幂等复用同一容器 instanceId 与持久卷';
  }

  if (context.itemId === 'C2') {
    await c.request({
      role: 'owner',
      kind: 'state',
      route: '/api/core/ai/skill/runtime/init',
      body: { skillId }
    });

    const instBefore = await instancesCol.findOne({ sourceType: 'skillEdit', sourceId: skillId });
    assert.ok(instBefore?.instanceId, '初始化后必须存在运行态容器 instanceId');
    assert.equal(instBefore.status, 'running');

    // 预置多层嵌套文件夹与文件，供右侧文件树并发展开与读写验证
    for (const dirPath of ['src/nested/deep', 'docs', 'assets']) {
      success(
        await c.request({
          role: 'owner',
          kind: 'state',
          route: '/api/core/ai/sandbox/fs/mkdir',
          body: { skillId, chatId: SKILL_CHAT_ID, path: dirPath }
        })
      );
    }
    for (const [filePath, text] of [
      ['src/nested/deep/module.py', 'DEEP_VAR = 1\n'],
      ['docs/guide.md', '# Skill Guide\n']
    ]) {
      success(
        await uploadSandboxBytes(c, {
          role: 'owner',
          kind: 'state',
          query: { skillId, chatId: SKILL_CHAT_ID, path: filePath },
          content: text
        })
      );
    }

    // 解析当前环境可用的 LLM 模型与 Plus 路由
    const catalogRes = await c.request({
      role: 'owner',
      kind: 'state',
      method: 'GET',
      route: '/api/core/ai/model/catalog'
    });
    const catalogData = catalogRes.json?.data?.data ?? catalogRes.json?.data;
    const modelId =
      catalogData?.defaultModelIds?.llm ??
      catalogData?.modelList?.find((m) => m.type === 'llm' && m.isActive !== false)?.modelId ??
      'deepseek-v4-flash';

    const initDataRes = await c.request({
      role: 'owner',
      kind: 'state',
      method: 'GET',
      route: '/api/system/getInitData'
    });
    const isPlus = Boolean(initDataRes.json?.data?.feConfigs?.isPlus);
    const debugChatRoute = isPlus
      ? '/api/proApi/core/ai/skill/debugChat'
      : '/api/core/ai/skill/debugChat';
    const debugChatId = `skill-dbg-chat-${c.run}`;

    // 辅助函数：在左侧 debugChat 流式执行的同时，右侧并发高频点击展开文件夹、下载、上传与预览
    async function runConcurrentChatAndRightIde(roundNumber, promptText) {
      const folderPaths = ['.', 'src', 'src/nested', 'src/nested/deep', 'docs', 'assets'];
      const rightSideOps = [];

      // 启动左侧 debugChat SSE 请求
      const chatPromise = c.request({
        role: 'owner',
        kind: 'state',
        route: debugChatRoute,
        body: {
          skillId,
          chatId: debugChatId,
          modelId,
          responseChatItemId: `resp-${c.run}-r${roundNumber}`,
          messages: [
            {
              dataId: `msg-${c.run}-r${roundNumber}`,
              role: 'user',
              content: promptText
            }
          ]
        }
      });

      // 在不同时间点（0ms, 40ms, 120ms, 250ms）并发触发右侧多层目录展开与文件读写，覆盖 debugChat 准备期与流式执行期
      for (const delayMs of [0, 40, 120, 250]) {
        rightSideOps.push(
          (async () => {
            if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
            const listResults = await Promise.all(
              folderPaths.map((p) =>
                c.request({
                  role: 'owner',
                  kind: 'state',
                  route: '/api/core/ai/sandbox/fs/list',
                  body: { skillId, chatId: SKILL_CHAT_ID, path: p }
                })
              )
            );
            for (let i = 0; i < listResults.length; i++) {
              const res = listResults[i];
              assert.equal(
                res.error,
                false,
                `第 ${roundNumber} 轮对话期间并发打开文件夹 ${folderPaths[i]} (delay=${delayMs}ms) 失败: status=${res.http}, statusText=${res.json?.statusText}, message=${res.json?.message}`
              );
            }
            return listResults.length;
          })()
        );
      }

      // 同时并发执行右侧文件读取、修改与预览链接签发
      rightSideOps.push(
        (async () => {
          const gitignoreRead = await downloadSandboxFile(c, {
            role: 'owner',
            kind: 'state',
            body: { skillId, chatId: SKILL_CHAT_ID, path: '.gitignore' }
          });
          assert.equal(gitignoreRead.error, false, '对话期间并发读取 .gitignore 应成功');
          assert.ok(gitignoreRead.text.includes('node_modules'));

          const updatedPy = `print("updated skill helper round ${roundNumber}")\n`;
          const writeRes = success(
            await uploadSandboxBytes(c, {
              role: 'owner',
              kind: 'state',
              query: {
                skillId,
                chatId: SKILL_CHAT_ID,
                path: 'src/helper.py'
              },
              content: updatedPy
            })
          );
          assert.match(writeRes.etag ?? '', /^W\/"/);

          const readPy = await downloadSandboxFile(c, {
            role: 'owner',
            kind: 'state',
            body: { skillId, chatId: SKILL_CHAT_ID, path: 'src/helper.py' }
          });
          assert.equal(readPy.error, false);
          assert.equal(readPy.text, updatedPy);

          const previewRes = success(
            await c.request({
              role: 'owner',
              kind: 'state',
              route: '/api/core/ai/sandbox/getFilePreviewLink',
              body: { skillId, chatId: SKILL_CHAT_ID, filePath: 'docs/guide.md' }
            })
          );
          assert.equal(typeof previewRes.url, 'string');
          return writeRes.etag;
        })()
      );

      const [chatRes, ...opResults] = await Promise.all([chatPromise, ...rightSideOps]);
      assert.equal(chatRes.http, 200, `第 ${roundNumber} 轮 debugChat HTTP 状态应为 200`);
      const errEvent = chatRes.events?.find((e) => e.event === 'error');
      assert.equal(
        errEvent,
        undefined,
        `第 ${roundNumber} 轮 debugChat 不得返回 error 事件: ${JSON.stringify(errEvent)}`
      );

      const instAfter = await instancesCol.findOne({ sourceType: 'skillEdit', sourceId: skillId });
      assert.equal(
        instAfter?.instanceId,
        instBefore.instanceId,
        `第 ${roundNumber} 轮对话及并发文件树操作期间不得销毁重建沙箱容器 instanceId`
      );
      assert.equal(
        instAfter?.image,
        instBefore.image,
        `第 ${roundNumber} 轮对话期间沙箱镜像标识不得发生跳变`
      );

      return {
        chatEventsCount: chatRes.events?.length ?? 0,
        sandboxPhasesInChat: (chatRes.events ?? [])
          .filter((e) => e.event === 'sandboxStatus')
          .map((e) => e.data?.phase),
        updatedEtag: opResults[opResults.length - 1]
      };
    }

    // 第 1 轮对话 + 右侧高频并发点击展开多层文件夹与读写文件
    const round1 = await runConcurrentChatAndRightIde(
      1,
      '请直接简短回复“收到第1轮”，不要调用任何工具。'
    );

    // 第 2 轮对话 + 右侧再次并发点击展开文件夹与读写文件
    const round2 = await runConcurrentChatAndRightIde(
      2,
      '请直接简短回复“收到第2轮”，不要调用任何工具。'
    );

    const rootListRes = success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/ai/sandbox/fs/list',
        body: { skillId, chatId: SKILL_CHAT_ID, path: '.' }
      })
    );
    const rootNames = rootListRes.entries.map((e) => e.name);
    assert.ok(rootNames.includes('SKILL.md'), '工作区应包含 SKILL.md');
    assert.ok(rootNames.includes('.gitignore'), '工作区应自动补齐默认 .gitignore');

    c.record('C2 左侧多轮 debugChat 与右侧文件树并发展开/读写', {
      debugChatRoute,
      modelId,
      instanceIdBefore: instBefore.instanceId,
      image: instBefore.image,
      round1,
      round2,
      rootEntries: rootNames
    });
    return '左侧连续两轮 debugChat 与右侧高频并发展开多层文件夹 (fs/list)、读写源码、签发预览全部成功，零 409 初始化冲突且容器 instanceId 全程不变';
  }

  if (context.itemId === 'C3') {
    await c.request({
      role: 'owner',
      kind: 'state',
      route: '/api/core/ai/skill/runtime/init',
      body: { skillId }
    });

    const marker1 = 'PTY_MARKER_1_' + Date.now();
    const session1 = await runPtyInteraction({
      c,
      skillId,
      waitForText: marker1,
      onConnected: async ({ sendControl, sendStdin }) => {
        sendControl({ type: 'resize', cols: 120, rows: 40 });
        sendControl({ type: 'signal', signal: 'SIGINT' });
        sendStdin(
          `mkdir -p pty_dir && printf "pty-created" > pty_dir/out.txt && echo "${marker1}"\n`
        );
      }
    });

    assert.ok(session1.ptySessionId, '首次连接应返回有效的 ptySessionId');
    assert.ok(session1.combinedOutput.includes(marker1), 'PTY 应输出命令结果');
    assert.ok(session1.lastOffset > 0, 'PTY 输出 offset 应递增');

    // 验证终端内创建的目录与文件在右侧文件树 fs/list 和 download 中即时可见
    const ptyDirList = success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/ai/sandbox/fs/list',
        body: { skillId, chatId: SKILL_CHAT_ID, path: 'pty_dir' }
      })
    );
    assert.ok(ptyDirList.entries.some((e) => e.name === 'out.txt'));
    const ptyFileRead = await downloadSandboxFile(c, {
      role: 'owner',
      kind: 'state',
      body: { skillId, chatId: SKILL_CHAT_ID, path: 'pty_dir/out.txt' }
    });
    assert.equal(ptyFileRead.text, 'pty-created');

    // 断线后携带 since: session1.lastOffset 重连，验证复用同一 ptySessionId 并继续交互
    const marker2 = 'PTY_RECONNECT_' + Date.now();
    const session2 = await runPtyInteraction({
      c,
      skillId,
      since: session1.lastOffset,
      waitForText: marker2,
      onConnected: async ({ sendStdin }) => {
        sendStdin(`echo "${marker2}"\n`);
      }
    });

    assert.equal(session2.reused, true, '断线重连签发票据应标记 reused=true');
    assert.equal(session2.ptySessionId, session1.ptySessionId, '断线重连应复用同一个后台 PTY 会话');
    assert.ok(session2.combinedOutput.includes(marker2));
    assert.ok(session2.lastOffset > session1.lastOffset);

    c.record('C3 PTY 原生 WebSocket 交互式终端与断线重连', {
      ptySessionId: session1.ptySessionId,
      reusedOnReconnect: session2.reused,
      offsetAfterFirst: session1.lastOffset,
      offsetAfterReconnect: session2.lastOffset
    });
    return 'PTY 终端 getTicket + WebSocket 二进制帧流、stdin/resize/signal 控制帧、终端新建文件实时同步与 since 增量断线重连闭环通过';
  }

  if (context.itemId === 'C4') {
    await c.request({
      role: 'owner',
      kind: 'state',
      route: '/api/core/ai/skill/runtime/init',
      body: { skillId }
    });

    // 1) 普通 App 会话调用 getTicket 必须被拒绝（仅限 skillEdit）
    const appTicketAttempt = await c.request({
      role: 'owner',
      kind: 'state',
      route: '/api/core/ai/sandbox/getTicket',
      body: { appId: W, chatId: 'normal-chat' }
    });
    assert.equal(appTicketAttempt.error, true, '普通 App 会话不得签发 PTY 终端 Ticket');

    // 2) 伪造 Ticket 访问 opensandbox-proxy `/terminal` 在边缘升级阶段直接返回 401
    const ownerTicket = success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/ai/sandbox/getTicket',
        body: { skillId, chatId: SKILL_CHAT_ID }
      })
    );
    const proxyHttpUrl = new URL(ownerTicket.url, c.fixture.baseUrl);
    proxyHttpUrl.protocol = proxyHttpUrl.protocol === 'wss:' ? 'https:' : 'http:';
    proxyHttpUrl.searchParams.set('ticket', 'forged.invalid.jwt');
    const forgedProxyRes = await fetch(proxyHttpUrl.toString(), { method: 'GET' });
    assert.equal(forgedProxyRes.status, 401, '伪造终端 Ticket 访问 opensandbox-proxy 应返回 401');

    // 3) 仅具 Skill 只读权限 (ReadPermissionVal) 的成员 B 调用 init / getTicket / upload / debugChat 均被拒绝
    await w.acl('B', skillId, roles.read, 'agentSkill');
    const readOnlyInit = await c.request({
      role: 'B',
      kind: 'state',
      route: '/api/core/ai/skill/runtime/init',
      body: { skillId }
    });
    assert.equal(readOnlyInit.error, true, '只读协作者调用 skill/runtime/init 应被拒绝');

    const readOnlyTicket = await c.request({
      role: 'B',
      kind: 'state',
      route: '/api/core/ai/sandbox/getTicket',
      body: {
        skillId,
        chatId: SKILL_CHAT_ID
      }
    });
    assert.equal(readOnlyTicket.error, true, '只读协作者调用 getTicket 应被拒绝');
    assert.equal(readOnlyTicket.json?.statusText, 'unAuthSkill');

    const readOnlyUpload = await uploadSandboxBytes(c, {
      role: 'B',
      kind: 'state',
      query: {
        skillId,
        chatId: SKILL_CHAT_ID,
        path: 'SKILL.md'
      },
      content: 'hack'
    });
    assert.equal(readOnlyUpload.error, true, '只读协作者调用 upload 应被拒绝');
    assert.equal(readOnlyUpload.json?.statusText, 'unAuthSkill');

    const readOnlyDebugChat = await c.request({
      role: 'B',
      kind: 'state',
      route: '/api/core/ai/skill/debugChat',
      body: {
        skillId,
        chatId: 'readonly-chat',
        modelId: 'deepseek-v4-flash',
        messages: [{ dataId: 'm1', role: 'user', content: 'hi' }]
      }
    });
    assert.equal(readOnlyDebugChat.error, true, '只读协作者调用 debugChat 应被拒绝');

    c.record('C4 终端会话类型限制、代理伪造票据拦截与只读协作者写拦截', {
      appTicketError: appTicketAttempt.error,
      forgedProxyStatus: forgedProxyRes.status,
      readOnlyInitError: readOnlyInit.error,
      readOnlyTicketError: readOnlyTicket.error,
      readOnlyDebugChatError: readOnlyDebugChat.error
    });
    return '非 skillEdit 会话被拒绝签发终端 Ticket，伪造票据在代理边缘返回 401，只读协作者调用 runtime/init、getTicket、upload 与 debugChat 均被拒绝';
  }
}

await runNodeCase(
  'FG-SKILL-DEBUGGING-001',
  Object.fromEntries(['C1', 'C2', 'C3', 'C4'].map((id) => [id, execute]))
);
