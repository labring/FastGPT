import { randomUUID } from 'node:crypto';
import { WebSocket } from 'undici';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  OPEN_SANDBOX_DEFAULT_HOME_PATH,
  SANDBOX_IDE_AGENT_WS_PORT
} from '@fastgpt/global/core/ai/sandbox/constants';
import {
  SANDBOX_EDIT_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import {
  getAuthenticatedIdeAgentEndpoint,
  getSandboxDiskUsage,
  invalidateIdeAgentPasswordCache
} from '@fastgpt/service/core/ai/sandbox/application/ideAgent';
import { assertSandboxWorkspaceWritable } from '@fastgpt/service/core/ai/sandbox/application/quota';
import { deleteSandboxResource } from '@fastgpt/service/core/ai/sandbox/application/resource';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { runSandboxTools } from '@fastgpt/service/core/ai/sandbox/application/toolCall';
import {
  SANDBOX_SHELL_LOG_MAX_BYTES,
  SANDBOX_SHELL_LOG_MAX_FILES
} from '@fastgpt/service/core/ai/sandbox/application/toolCall/shell.tool';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import { getSandboxIntegrationProvider } from './config';

const { Types } = connectionMongo;
const integrationProvider = getSandboxIntegrationProvider();

const buildWsUrl = (endpoint: { url: string; protocol: string }, path: string): string => {
  const base = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(endpoint.url)
    ? endpoint.url
    : `${endpoint.protocol}://${endpoint.url}`;
  return `${base.replace(/^http/, 'ws').replace(/\/+$/, '')}${path}`;
};

const openWs = (url: string, headers: Record<string, string>) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out opening ${url}`));
    }, 10_000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket error on ${url}: ${String((e as { error?: unknown }).error)}`));
    });
  });

const sendFsRpc = (
  ws: WebSocket,
  request: { id: number; method: string; params: Record<string, unknown> }
) =>
  new Promise<{ result?: unknown; error?: { code: number; message: string } }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        ws.removeEventListener('message', onMessage);
        reject(new Error(`Timed out on ${request.method}`));
      }, 10_000);
      const onMessage = (event: { data: unknown }) => {
        const payload = JSON.parse(String(event.data));
        if (payload.id !== request.id) return;
        clearTimeout(timer);
        ws.removeEventListener('message', onMessage);
        resolve(payload);
      };
      ws.addEventListener('message', onMessage);
      ws.send(JSON.stringify({ jsonrpc: '2.0', ...request }));
    }
  );

describe.skipIf(!integrationProvider)(
  'Docker agent sandbox volume disk soft-limit integration',
  () => {
    let originalRuntime: 'docker' | 'kubernetes';
    let originalStorageSizeGi: number;

    beforeAll(() => {
      const config = getTestInstanceConfig().subservice.agentSandbox;
      originalRuntime = config.opensandbox.runtime;
      originalStorageSizeGi = config.common.storageSizeGi;
    });

    afterAll(() => {
      const config = getTestInstanceConfig().subservice.agentSandbox;
      config.opensandbox.runtime = originalRuntime;
      config.common.storageSizeGi = originalStorageSizeGi;
      invalidateIdeAgentPasswordCache();
    });

    it('enforces volume-only soft quota across ide-agent, tools, shell 0:0 self-rescue, PTY RLIMIT_FSIZE, and shell log caps', async () => {
      const config = getTestInstanceConfig().subservice.agentSandbox;
      if (config.opensandbox.runtime !== 'docker') return;

      // 使用 2 MiB 测试上限，在真实 Docker 容器中验证超限、自救与解锁闭环。
      const testStorageSizeGi = 2 / 1024;
      config.common.storageSizeGi = testStorageSizeGi;
      const limitBytes = Math.round(testStorageSizeGi * 1024 * 1024 * 1024);

      const app = await MongoApp.create({
        name: 'Disk Soft Limit E2E',
        type: AppTypeEnum.simple,
        teamId: new Types.ObjectId(),
        tmbId: new Types.ObjectId(),
        modules: []
      });
      const sourceId = String(app._id);
      const userId = `disk-limit-${randomUUID()}`;
      const sandboxId = getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId,
        userId
      });
      let sandbox: SandboxClient | undefined;

      try {
        sandbox = await getSandboxClient({
          sandboxId,
          sourceType: ChatSourceTypeEnum.app,
          sourceId,
          userId,
          chatId: `chat-${randomUUID()}`
        });
        await sandbox.ensureAvailable();
        const exec = (cmd: string) => sandbox!.opensandbox.execute(cmd);

        // 1. entrypoint 不再写 /tmp/ide-agent.log，且 /disk-usage 只计量 /home/sandbox（卷外 /tmp 不计入）。
        expect((await exec('test ! -e /tmp/ide-agent.log')).exitCode).toBe(0);
        const initial = await getSandboxDiskUsage({ sandbox: sandbox.opensandbox, refresh: true });
        expect(initial.limitBytes).toBe(limitBytes);
        expect(initial.usedBytes).toBeLessThan(limitBytes);

        expect((await exec('head -c 4194304 /dev/zero > /tmp/outside-volume.bin')).exitCode).toBe(
          0
        );
        const afterTmp = await getSandboxDiskUsage({ sandbox: sandbox.opensandbox, refresh: true });
        expect(afterTmp.usedBytes).toBeLessThan(limitBytes);
        await exec('rm -f /tmp/outside-volume.bin');

        // 2. shell.tool.ts 单日志 5 MiB 封顶 + 最近 10 份淘汰。
        const bigOut = await runSandboxTools({
          toolName: SANDBOX_SHELL_TOOL_NAME,
          args: JSON.stringify({ command: 'head -c 6291456 /dev/zero | tr "\\0" "a"' }),
          sandboxClient: sandbox
        });
        expect(bigOut.success).toBe(true);
        const maxLogBytes = Number(
          (await exec('stat -c "%s" /tmp/fastgpt-bash-*.log | sort -nr | head -n 1')).stdout.trim()
        );
        expect(maxLogBytes).toBeLessThanOrEqual(SANDBOX_SHELL_LOG_MAX_BYTES);

        await exec(
          'for i in $(seq 1 12); do touch -d "2026-01-01 00:00:$i" "/tmp/fastgpt-bash-old-$i.log"; done'
        );
        await runSandboxTools({
          toolName: SANDBOX_SHELL_TOOL_NAME,
          args: JSON.stringify({ command: 'seq 1 2005' }),
          sandboxClient: sandbox
        });
        const logCount = Number(
          (await exec('ls -1 /tmp/fastgpt-bash-*.log | wc -l')).stdout.trim()
        );
        expect(logCount).toBeLessThanOrEqual(SANDBOX_SHELL_LOG_MAX_FILES);

        // 3. 写入种子文件并在持久卷内写入 3 MiB 触发超限。
        const seed = await runSandboxTools({
          toolName: SANDBOX_WRITE_FILE_TOOL_NAME,
          args: JSON.stringify({ path: 'note.txt', content: 'hello world' }),
          sandboxClient: sandbox
        });
        expect(seed.success).toBe(true);

        expect(
          (
            await exec(
              `head -c 3145728 /dev/zero > ${OPEN_SANDBOX_DEFAULT_HOME_PATH}/workspace/huge.bin`
            )
          ).exitCode
        ).toBe(0);
        const over = await getSandboxDiskUsage({ sandbox: sandbox.opensandbox, refresh: true });
        expect(over.usedBytes).toBeGreaterThanOrEqual(limitBytes);

        // 4. 用户态写守卫抛业务错误码；Agent write/edit 工具被拦截并返回明确清理指引。
        await expect(assertSandboxWorkspaceWritable(sandbox.opensandbox)).rejects.toMatchObject({
          message: SandboxErrEnum.agentSandboxDiskQuotaExceeded
        });
        for (const [toolName, args] of [
          [SANDBOX_WRITE_FILE_TOOL_NAME, { path: 'blocked.txt', content: 'nope' }],
          [
            SANDBOX_EDIT_FILE_TOOL_NAME,
            { entries: [{ path: 'note.txt', oldContent: 'hello', newContent: 'hi' }] }
          ]
        ] as const) {
          const blocked = await runSandboxTools({
            toolName,
            args: JSON.stringify(args),
            sandboxClient: sandbox
          });
          expect(blocked.success).toBe(false);
          expect(blocked.response).toContain('Sandbox disk quota exceeded');
          expect(blocked.response).toContain('sandbox_shell');
        }

        // 5. Kubernetes 运行时即使当前已超限也会零开销跳过软限制检查；验证后恢复 docker 运行时验证拦截面。
        config.opensandbox.runtime = 'kubernetes';
        await expect(assertSandboxWorkspaceWritable(sandbox.opensandbox)).resolves.toBeUndefined();
        config.opensandbox.runtime = 'docker';

        // 6. IDE WS /fs 拒绝 write_file/mkdir（-32005）并放行 read_dir；/terminal 下发超限提示并启用 RLIMIT_FSIZE=0。
        const wsEndpoint = await getAuthenticatedIdeAgentEndpoint({
          sandbox: sandbox.opensandbox,
          port: SANDBOX_IDE_AGENT_WS_PORT
        });
        const fsWs = await openWs(
          buildWsUrl(wsEndpoint, '/fs?permission=write'),
          wsEndpoint.headers
        );
        try {
          const w = await sendFsRpc(fsWs, {
            id: 1,
            method: 'fs/write_file',
            params: {
              path: 'ws-blocked.txt',
              content: Buffer.from('nope').toString('base64')
            }
          });
          expect(w.error?.code).toBe(-32005);
          const m = await sendFsRpc(fsWs, {
            id: 2,
            method: 'fs/mkdir',
            params: { path: 'ws-blocked-dir' }
          });
          expect(m.error?.code).toBe(-32005);
          expect(
            (await sendFsRpc(fsWs, { id: 3, method: 'fs/read_dir', params: { path: '.' } })).error
          ).toBeUndefined();
        } finally {
          fsWs.close();
        }

        const restrictedTermWs = await openWs(
          buildWsUrl(wsEndpoint, '/terminal?permission=write'),
          wsEndpoint.headers
        );
        restrictedTermWs.binaryType = 'arraybuffer';
        try {
          const quotaMarker = `TERM_QUOTA_${randomUUID().slice(0, 8)}`;
          const termOut = await new Promise<string>((resolve, reject) => {
            let out = '';
            const timer = setTimeout(() => reject(new Error(`PTY quota timeout: ${out}`)), 10_000);
            restrictedTermWs.addEventListener('message', (e) => {
              out +=
                typeof e.data === 'string'
                  ? e.data
                  : Buffer.from(e.data as ArrayBuffer).toString('utf8');
              if (out.includes('[Disk Quota Exceeded]') && out.includes(quotaMarker)) {
                clearTimeout(timer);
                resolve(out);
              }
            });
            restrictedTermWs.send(
              `echo blocked > /home/sandbox/workspace/term-blocked.txt 2>&1; echo ${quotaMarker}\n`
            );
          });
          expect(termOut).toContain('[Disk Quota Exceeded]');
          expect(termOut).toContain('RLIMIT_FSIZE=0');
          expect((await exec('test ! -s /home/sandbox/workspace/term-blocked.txt')).exitCode).toBe(
            0
          );
        } finally {
          restrictedTermWs.close();
        }

        // 6. sandbox_shell 超限降级 prlimit --fsize=0:0：ulimit 无法提权绕过且写文件被内核杀掉（153），du/rm 正常自救。
        const shellBlocked = await runSandboxTools({
          toolName: SANDBOX_SHELL_TOOL_NAME,
          args: JSON.stringify({
            command: 'ulimit -f unlimited 2>&1; echo blocked > shell-blocked.txt'
          }),
          sandboxClient: sandbox
        });
        expect(shellBlocked.response).toContain('cannot modify limit');
        expect(shellBlocked.response).toContain('Command exited with code 153');
        expect(shellBlocked.response).toContain('RLIMIT_FSIZE=0');

        const shellClean = await runSandboxTools({
          toolName: SANDBOX_SHELL_TOOL_NAME,
          args: JSON.stringify({
            command: `du -sh ${OPEN_SANDBOX_DEFAULT_HOME_PATH}/workspace/huge.bin && rm -f ${OPEN_SANDBOX_DEFAULT_HOME_PATH}/workspace/huge.bin`
          }),
          sandboxClient: sandbox
        });
        expect(shellClean.success).toBe(true);
        expect(shellClean.response).not.toContain('Command exited with code');

        // 7. 无需任何主站缓存失效：容器超限态自动重扫，主站工具、IDE WS 写与异步 PTY 终端立即全部解锁。
        await expect(assertSandboxWorkspaceWritable(sandbox.opensandbox)).resolves.toBeUndefined();
        const unlocked = await runSandboxTools({
          toolName: SANDBOX_WRITE_FILE_TOOL_NAME,
          args: JSON.stringify({ path: 'after-cleanup.txt', content: 'recovered' }),
          sandboxClient: sandbox
        });
        expect(unlocked.success).toBe(true);

        const fsWs2 = await openWs(
          buildWsUrl(wsEndpoint, '/fs?permission=write'),
          wsEndpoint.headers
        );
        try {
          const ok = await sendFsRpc(fsWs2, {
            id: 10,
            method: 'fs/write_file',
            params: {
              path: 'ws-recovered.txt',
              content: Buffer.from('ok').toString('base64')
            }
          });
          expect(ok.error).toBeUndefined();
        } finally {
          fsWs2.close();
        }

        // 验证异步 pty-process 终端交互与 pre_exec RLIMIT_FSIZE 实际生效。
        const termWs = await openWs(
          buildWsUrl(wsEndpoint, '/terminal?permission=write'),
          wsEndpoint.headers
        );
        termWs.binaryType = 'arraybuffer';
        try {
          const marker = `PTY_OK_${randomUUID().slice(0, 8)}`;
          await new Promise<void>((resolve, reject) => {
            let out = '';
            const timer = setTimeout(() => reject(new Error(`PTY timeout: ${out}`)), 10_000);
            termWs.addEventListener('message', (e) => {
              out +=
                typeof e.data === 'string'
                  ? e.data
                  : Buffer.from(e.data as ArrayBuffer).toString('utf8');
              if (out.includes(marker)) {
                clearTimeout(timer);
                resolve();
              }
            });
            termWs.send(
              `head -c ${limitBytes + 65536} /dev/zero > /tmp/pty-fsize.bin 2>/dev/null; echo ${marker}\n`
            );
          });
          const ptySize = Number((await exec('stat -c "%s" /tmp/pty-fsize.bin')).stdout.trim());
          expect(ptySize).toBeLessThanOrEqual(limitBytes);
        } finally {
          termWs.close();
        }
      } finally {
        config.opensandbox.runtime = originalRuntime;
        config.common.storageSizeGi = originalStorageSizeGi;
        if (sandbox) {
          await sandbox.close().catch(() => undefined);
          await deleteSandboxResource({ sandboxId }).catch(() => undefined);
        }
        await MongoApp.deleteOne({ _id: app._id }).catch(() => undefined);
      }
    }, 180_000);
  }
);
