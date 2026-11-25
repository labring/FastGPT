import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { invalidateIdeAgentPasswordCache } from '@fastgpt/service/core/ai/sandbox/application/ideAgent';
import { sandboxShellTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/shell.tool';

const createSandboxInstance = (options: { withDiskProbe?: boolean; id?: string } = {}) =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    runWithRecovery: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    exec: vi.fn(async () => ({ stdout: 'out', stderr: '', exitCode: 0, truncated: false })),
    opensandbox: {
      id: options.id ?? 'sbx-shell-1',
      deleteFiles: vi.fn(async () => []),
      ...(options.withDiskProbe
        ? {
            getEndpoint: vi.fn(async () => ({
              url: '127.0.0.1:1319',
              protocol: 'http',
              headers: {}
            })),
            readFiles: vi.fn(async () => [{ content: Buffer.from('token'), error: null }])
          }
        : {})
    }
  }) as any;

describe('sandboxShellTool', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    global.systemInstanceConfig = createDefaultInstanceConfig();
    invalidateIdeAgentPasswordCache();
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'kubernetes';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    invalidateIdeAgentPasswordCache();
    global.systemInstanceConfig = createDefaultInstanceConfig();
  });

  it('rejects shell timeout out of bounds via schema validation', () => {
    expect(() => sandboxShellTool.zodSchema.parse({ command: 'sleep 1', timeout: 601 })).toThrow();
    expect(() => sandboxShellTool.zodSchema.parse({ command: 'sleep 1', timeout: 0 })).toThrow();
    expect(() => sandboxShellTool.zodSchema.parse({ command: 'sleep 1', timeout: -1 })).toThrow();
  });

  it('runs direct bash execution without tail/python3/prlimit on kubernetes runtime and forwards options', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'echo hi', timeout: 3 }
    });

    expect(result.response).toBe('out');
    expect(sandbox.exec).toHaveBeenLastCalledWith(`exec /bin/bash -c 'echo hi' 2>&1`, {
      timeout: 3
    });
    const [executedScript] = sandbox.exec.mock.calls[0]!;
    expect(executedScript).not.toContain('tail');
    expect(executedScript).not.toContain('python3');
    expect(executedScript).not.toContain('prlimit');
    expect(executedScript).not.toContain('| cat');
    expect(sandbox.opensandbox.deleteFiles).not.toHaveBeenCalled();

    const controller = new AbortController();
    await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'sleep 10', timeout: 30 },
      signal: controller.signal
    });
    expect(sandbox.exec).toHaveBeenLastCalledWith(`exec /bin/bash -c 'sleep 10' 2>&1`, {
      timeout: 30,
      signal: controller.signal
    });
  });

  it('does not block foreground exit when background child inherits file-backed stdout/stderr and preserves truncation notices', async () => {
    const sandbox = createSandboxInstance();

    sandbox.exec.mockImplementationOnce(async (script: string) => {
      const tempDir = mkdtempSync(join(tmpdir(), 'shell-tool-bg-'));
      const logFile = join(tempDir, 'execd.log');
      let fd: number | undefined = openSync(logFile, 'w');
      let bgPid: number | undefined;
      try {
        const startedAt = Date.now();
        const proc = spawnSync('/bin/bash', ['-c', script], {
          stdio: ['ignore', fd, fd],
          timeout: 5_000
        });
        const elapsedMs = Date.now() - startedAt;
        closeSync(fd);
        fd = undefined;
        const stdout = readFileSync(logFile, 'utf8');
        const pidMatch = stdout.match(/BG_PID=(\d+)/);
        bgPid = pidMatch ? Number(pidMatch[1]) : undefined;
        expect(elapsedMs).toBeLessThan(1_000);
        return {
          stdout,
          stderr: '',
          exitCode: proc.status ?? 1,
          truncated: false
        };
      } finally {
        if (bgPid !== undefined && Number.isFinite(bgPid)) {
          try {
            process.kill(bgPid, 'SIGKILL');
          } catch {}
        }
        if (fd !== undefined) {
          try {
            closeSync(fd);
          } catch {}
        }
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    const bgRes = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'sleep 5 & echo "BG_PID=$!"; echo ready' }
    });
    expect(bgRes.response).toContain('ready');

    const runReal = async (script: string) => {
      const proc = spawnSync('/bin/bash', ['-c', script], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10_000
      });
      return {
        stdout: proc.stdout,
        stderr: proc.stderr,
        exitCode: proc.status ?? 1,
        truncated: false
      };
    };

    sandbox.exec.mockImplementationOnce(runReal);
    const smallRes = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'echo hello-small' }
    });
    expect(smallRes.response.trim()).toBe('hello-small');

    sandbox.exec.mockImplementationOnce(runReal);
    const largeRes = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'seq 1 2005' }
    });
    expect(largeRes.response).toContain('2005');
    expect(largeRes.response).not.toContain('\n1\n2\n');
    expect(largeRes.response).toContain(
      '[Showing last 2000 of 2005 lines. Redirect output to a file if you need full logs.]'
    );

    sandbox.exec.mockResolvedValueOnce({
      stdout: 'tail-bytes-only',
      stderr: '',
      exitCode: 5,
      truncated: true
    });
    const upstreamTruncatedRes = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'seq 1 30000; exit 5' }
    });
    expect(upstreamTruncatedRes.response).toContain('tail-bytes-only');
    expect(upstreamTruncatedRes.response).toContain('Command exited with code 5');
    expect(upstreamTruncatedRes.response).toMatch(
      /\[Showing last \d+ bytes of output\. Redirect output to a file if you need full logs\.\]/
    );
    expect(upstreamTruncatedRes.response).not.toMatch(/Showing last \d+ of \d+ lines/);
  });

  it('preserves stdout and exit code via PIPESTATUS in exceeded docker mode without tail, mkfifo, or python3', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
    const limit = 1024 * 1024 * 1024;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ usedBytes: limit + 1024, limitBytes: limit }), {
          status: 200
        })
    ) as unknown as typeof fetch;

    const sandbox = createSandboxInstance({ withDiskProbe: true, id: 'sbx-docker-exceeded-pipe' });
    sandbox.exec.mockImplementationOnce(async (script: string) => {
      expect(script).toBe(
        `prlimit --fsize=0:0 -- /bin/bash -c 'echo ready; exit 7' 2>&1 | cat; exit "\${PIPESTATUS[0]}"`
      );
      expect(script).not.toContain('tail');
      expect(script).not.toContain('mkfifo');
      expect(script).not.toContain('python3');
      // 在无 Linux prlimit 的宿主（如 macOS）剥离 prlimit 前缀，真实验证管道 + PIPESTATUS[0] 透传 stdout 与退出码。
      const runnableScript = script.replaceAll(/prlimit --fsize=\d+:\d+ -- /g, '');
      const proc = spawnSync('/bin/bash', ['-c', runnableScript], {
        encoding: 'utf8',
        timeout: 5_000
      });
      return {
        stdout: proc.stdout,
        stderr: proc.stderr,
        exitCode: proc.status ?? 1,
        truncated: false
      };
    });

    const result = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'echo ready; exit 7' }
    });

    expect(result.response).toContain('ready');
    expect(result.response).toContain('Command exited with code 7');
    expect(result.response).toContain('RLIMIT_FSIZE=0');
  });

  it('uses container effective limitBytes for prlimit without tail wrapper when instance storageSizeGi changes', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 4;
    const containerLimit = 1024 * 1024 * 1024;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ usedBytes: 1024, limitBytes: containerLimit }), {
          status: 200
        })
    ) as unknown as typeof fetch;

    const sandbox = createSandboxInstance({ withDiskProbe: true, id: 'sbx-docker-limit-sync' });
    await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'echo hi' }
    });

    const [executedScript] = sandbox.exec.mock.calls[0]!;
    expect(executedScript).toBe(
      `prlimit --fsize=${containerLimit}:${containerLimit} -- /bin/bash -c 'echo hi' 2>&1; exit $?`
    );
  });

  it('degrades to prlimit --fsize=0:0 with agent cleanup guidance when docker disk quota is exceeded', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 1;
    const limit = 1024 * 1024 * 1024;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ usedBytes: limit + 10 * 1024 * 1024 }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ usedBytes: 1024 }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const sandbox = createSandboxInstance({ withDiskProbe: true, id: 'sbx-docker-exceeded' });
    sandbox.exec.mockResolvedValueOnce({
      stdout: 'removed big.bin',
      stderr: '',
      exitCode: 0,
      truncated: false
    });

    const result = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'rm -f /home/sandbox/workspace/big.bin' }
    });

    const [firstScript] = sandbox.exec.mock.calls[0]!;
    expect(firstScript).toBe(
      `prlimit --fsize=0:0 -- /bin/bash -c 'rm -f /home/sandbox/workspace/big.bin' 2>&1 | cat; exit "\${PIPESTATUS[0]}"`
    );
    expect(firstScript).not.toContain('tail');
    expect(firstScript).not.toContain('mkfifo');
    expect(firstScript).not.toContain('python3');
    expect(result.response).toContain('removed big.bin');
    expect(result.response).toContain('RLIMIT_FSIZE=0');
    expect(result.response).toContain('/home/sandbox');

    // 下次执行将向容器实时复核，容量降回上限以下后自动恢复正常单文件配额。
    await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'echo ok' }
    });
    const [secondScript] = sandbox.exec.mock.calls[1]!;
    expect(secondScript).toBe(
      `prlimit --fsize=${limit}:${limit} -- /bin/bash -c 'echo ok' 2>&1; exit $?`
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('appends cleanup guidance on ENOSPC or Docker SIGXFSZ non-zero exit without false positives on exit 0', async () => {
    const sandbox = createSandboxInstance();

    // K8s 命令非零退出且输出包含 No space left on device → 追加清理指引（不提 RLIMIT_FSIZE=0）。
    sandbox.exec.mockResolvedValueOnce({
      stdout: '',
      stderr: "dd: error writing 'big.bin': No space left on device",
      exitCode: 1,
      truncated: false
    });
    const fullRes = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'dd if=/dev/zero of=big.bin bs=1M count=2048' }
    });
    expect(fullRes.response).toContain('No space left on device');
    expect(fullRes.response).toContain('Command exited with code 1');
    expect(fullRes.response).toContain('Sandbox disk space is full');
    expect(fullRes.response).not.toContain('RLIMIT_FSIZE=0');

    // exitCode=0 时即便输出含关键词也不误报（如 grep 日志）。
    sandbox.exec.mockResolvedValueOnce({
      stdout: 'app.log:12: No space left on device',
      stderr: '',
      exitCode: 0,
      truncated: false
    });
    const grepRes = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'grep "No space left on device" app.log' }
    });
    expect(grepRes.response).not.toContain('Sandbox disk space is full');

    // Docker 正常态下运行期单文件触发 SIGXFSZ：通过真实外层 bash 回收子进程信号，确保正常退出 153 而非被 execd 报成 -1。
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
    const limit = 1024 * 1024 * 1024;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ usedBytes: 1024, limitBytes: limit }), { status: 200 })
    ) as unknown as typeof fetch;
    const dockerSandbox = createSandboxInstance({ withDiskProbe: true, id: 'sbx-docker-sigxfsz' });
    dockerSandbox.exec.mockImplementationOnce(async (script: string) => {
      const runnableScript = script.replaceAll(/prlimit --fsize=\d+:\d+ -- /g, '');
      const proc = spawnSync('/bin/bash', ['-c', runnableScript], {
        encoding: 'utf8',
        timeout: 5_000
      });
      expect(proc.signal).toBeNull();
      return {
        stdout: proc.stdout,
        stderr: proc.stderr,
        exitCode: proc.status ?? -1,
        truncated: false
      };
    });
    const sigxfszRes = await sandboxShellTool.execute({
      sandboxInstance: dockerSandbox,
      params: { command: 'kill -XFSZ $$' }
    });
    expect(sigxfszRes.response).toContain('Command exited with code 153');
    expect(sigxfszRes.response).toContain('Sandbox single-file write limit exceeded (1.00 GiB)');
  });

  it('returns combined output and a non-zero exit status as plain text', async () => {
    const sandbox = createSandboxInstance();
    sandbox.exec.mockResolvedValueOnce({ stdout: 'out', stderr: 'err', exitCode: 2 });

    const result = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'bad-command' }
    });

    expect(result.response).toBe('out\nerr\n\nCommand exited with code 2');
  });

  it('keeps the tail of long output and suggests redirecting to a file', async () => {
    const sandbox = createSandboxInstance();
    sandbox.exec.mockResolvedValueOnce({
      stdout: Array.from({ length: 2001 }, (_, index) => `line ${index + 1}`).join('\n'),
      stderr: '',
      exitCode: 0
    });

    const result = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'generate-output' }
    });

    expect(result.response).toContain('line 2\nline 3');
    expect(result.response).not.toContain('line 1\nline 2');
    expect(result.response).toMatch(
      /\[Showing last 2000 of 2001 lines\. Redirect output to a file if you need full logs\.\]/
    );
    expect(sandbox.opensandbox.deleteFiles).not.toHaveBeenCalled();
  });
});
