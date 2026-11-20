import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { invalidateIdeAgentPasswordCache } from '@fastgpt/service/core/ai/sandbox/application/ideAgent';
import {
  SANDBOX_SHELL_LOG_MAX_BYTES,
  SANDBOX_SHELL_LOG_MAX_FILES,
  sandboxShellTool
} from '@fastgpt/service/core/ai/sandbox/application/toolCall/shell.tool';

const createSandboxInstance = (options: { withDiskProbe?: boolean; id?: string } = {}) =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
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

  it('rejects shell timeout larger than max before executing sandbox', () => {
    const sandbox = createSandboxInstance();

    expect(() => sandboxShellTool.zodSchema.parse({ command: 'sleep 1', timeout: 601 })).toThrow();
    expect(sandbox.exec).not.toHaveBeenCalled();
  });

  it('rejects non-positive shell timeout before executing sandbox', () => {
    const sandbox = createSandboxInstance();

    expect(() => sandboxShellTool.zodSchema.parse({ command: 'sleep 1', timeout: 0 })).toThrow();
    expect(() => sandboxShellTool.zodSchema.parse({ command: 'sleep 1', timeout: -1 })).toThrow();
    expect(sandbox.exec).not.toHaveBeenCalled();
  });

  it('passes caps and avoids prlimit or deleteFiles RPC on kubernetes runtime', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'echo hi', timeout: 3 }
    });

    expect(result.response).toBe('out');
    const [executedScript, timeout] = sandbox.exec.mock.calls[0]!;
    expect(timeout).toBe(3);
    expect(executedScript).toMatch(/^exec python3 -c /);
    expect(executedScript).not.toContain('prlimit');
    expect(executedScript).toContain(String(SANDBOX_SHELL_LOG_MAX_BYTES));
    expect(executedScript).toContain(String(SANDBOX_SHELL_LOG_MAX_FILES));
    expect(sandbox.opensandbox.deleteFiles).not.toHaveBeenCalled();
  });

  it('skips writing log file on small output and prunes old logs on truncated output', async () => {
    const sandbox = createSandboxInstance();
    const runReal = async (script: string) => {
      const proc = spawnSync('/bin/bash', ['-c', script], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 15_000
      });
      return {
        stdout: proc.stdout,
        stderr: proc.stderr,
        exitCode: proc.status ?? 1,
        truncated: false
      };
    };

    const createdFiles: string[] = [];
    try {
      // 小输出不写盘，也不触发额外删除 RPC。
      let smallLogPath = '';
      sandbox.exec.mockImplementationOnce(async (script: string) => {
        smallLogPath = script.match(/\/tmp\/fastgpt-bash-[A-Za-z0-9_-]+\.log/)?.[0] ?? '';
        return runReal(script);
      });
      const smallRes = await sandboxShellTool.execute({
        sandboxInstance: sandbox,
        params: { command: 'echo hello-small' }
      });
      expect(smallRes.response.trim()).toBe('hello-small');
      expect(smallLogPath).toMatch(/^\/tmp\/fastgpt-bash-/);
      expect(existsSync(smallLogPath)).toBe(false);
      expect(sandbox.opensandbox.deleteFiles).not.toHaveBeenCalled();

      // 超过行数阈值的输出落盘，并按 mtime 淘汰超出上限的历史日志。
      for (let i = 1; i <= SANDBOX_SHELL_LOG_MAX_FILES + 2; i += 1) {
        const oldPath = `/tmp/fastgpt-bash-prune-old-${i}.log`;
        createdFiles.push(oldPath);
        spawnSync('touch', ['-t', `202001010000.${String(i).padStart(2, '0')}`, oldPath]);
      }

      let largeLogPath = '';
      sandbox.exec.mockImplementationOnce(async (script: string) => {
        largeLogPath = script.match(/\/tmp\/fastgpt-bash-[A-Za-z0-9_-]+\.log/)?.[0] ?? '';
        if (largeLogPath) createdFiles.push(largeLogPath);
        return runReal(script);
      });
      const largeRes = await sandboxShellTool.execute({
        sandboxInstance: sandbox,
        params: { command: 'seq 1 2005' }
      });
      expect(largeLogPath).toMatch(/^\/tmp\/fastgpt-bash-/);
      expect(existsSync(largeLogPath)).toBe(true);
      expect(largeRes.response).toContain(`Saved log (up to last 5 MiB): ${largeLogPath}`);
      const remainingOld = createdFiles.filter((p) => p !== largeLogPath && existsSync(p));
      expect(remainingOld.length).toBeLessThanOrEqual(SANDBOX_SHELL_LOG_MAX_FILES - 1);
    } finally {
      if (createdFiles.length > 0) {
        spawnSync('rm', ['-f', ...createdFiles]);
      }
    }
  });

  it('bounds disk usage during >5 MiB output, keeps the tail 5 MiB, and preserves exit code', async () => {
    const sandbox = createSandboxInstance();
    let capturedLogPath = '';
    sandbox.exec.mockImplementationOnce(async (script: string) => {
      const logMatch = script.match(/\/tmp\/fastgpt-bash-[A-Za-z0-9_-]+\.log/);
      capturedLogPath = logMatch?.[0] ?? '';
      const proc = spawnSync('/bin/bash', ['-c', script], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 15_000
      });
      return {
        stdout: proc.stdout,
        stderr: proc.stderr,
        exitCode: proc.status ?? 1,
        truncated: false
      };
    });

    // 输出约 6.5 MiB（含头尾标记），并在中途检查 /tmp 日志文件不提前膨胀，最终以非零状态码退出。
    const producerCmd = [
      "python3 -c 'import glob, os, sys",
      'sys.stdout.buffer.write(b"HEAD_MARKER_START\\n")',
      'chunk = b"A" * 65536',
      'for _ in range(104):',
      '    sys.stdout.buffer.write(chunk)',
      'sys.stdout.buffer.flush()',
      'mid_logs = [os.path.getsize(p) for p in glob.glob("/tmp/fastgpt-bash-*.log") if os.path.exists(p)]',
      'assert all(sz <= 5242880 for sz in mid_logs), f"mid-run log exceeded cap: {mid_logs}"',
      'sys.stdout.buffer.write(b"\\nTAIL_MARKER_END\\n")',
      'sys.stdout.buffer.flush()',
      "'; exit 9"
    ].join('\n');

    try {
      const result = await sandboxShellTool.execute({
        sandboxInstance: sandbox,
        params: { command: producerCmd }
      });

      expect(capturedLogPath).toMatch(/^\/tmp\/fastgpt-bash-/);
      expect(existsSync(capturedLogPath)).toBe(true);
      expect(statSync(capturedLogPath).size).toBe(SANDBOX_SHELL_LOG_MAX_BYTES);

      const savedLog = readFileSync(capturedLogPath, 'utf8');
      expect(savedLog).toContain('TAIL_MARKER_END');
      expect(savedLog).not.toContain('HEAD_MARKER_START');
      expect(result.response).toContain('TAIL_MARKER_END');
      expect(result.response).toContain('Command exited with code 9');
      expect(result.response).toContain(`Saved log (up to last 5 MiB): ${capturedLogPath}`);
      expect(sandbox.opensandbox.deleteFiles).not.toHaveBeenCalled();
    } finally {
      if (capturedLogPath) {
        spawnSync('rm', ['-f', capturedLogPath]);
      }
    }
  });

  it('keeps disk bounded during execution and leaves no log on SIGTERM timeout cancellation', async () => {
    const sandbox = createSandboxInstance();
    let capturedLogPath = '';
    let midRunLogExists = false;
    let capturedExitCode: number | null = null;

    sandbox.exec.mockImplementationOnce(async (script: string) => {
      const logMatch = script.match(/\/tmp\/fastgpt-bash-[A-Za-z0-9_-]+\.log/);
      capturedLogPath = logMatch?.[0] ?? '';

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const child = spawn('/bin/bash', ['-c', script], { stdio: ['ignore', 'pipe', 'pipe'] });
        child.on('error', reject);
        child.on('exit', (code) => resolve(code));

        // 持续输出 300ms 后检查运行期日志未落盘膨胀，随后发送 SIGTERM 模拟超时取消。
        setTimeout(() => {
          midRunLogExists = existsSync(capturedLogPath);
          child.kill('SIGTERM');
        }, 300);
      });
      capturedExitCode = exitCode;

      return {
        stdout: '',
        stderr: 'Command timed out',
        exitCode: exitCode ?? -1,
        truncated: false
      };
    });

    const noisyForeverCmd =
      'python3 -c \'import sys; buf = b"0123456789abcdef" * 4096\nwhile True:\n    sys.stdout.buffer.write(buf)\n    sys.stdout.buffer.flush()\'';

    try {
      await sandboxShellTool.execute({
        sandboxInstance: sandbox,
        params: { command: noisyForeverCmd, timeout: 1 }
      });

      expect(capturedLogPath).toMatch(/^\/tmp\/fastgpt-bash-/);
      expect(midRunLogExists).toBe(false);
      expect(capturedExitCode).toBe(143);
      expect(existsSync(capturedLogPath)).toBe(false);
    } finally {
      if (capturedLogPath) {
        spawnSync('rm', ['-f', capturedLogPath]);
      }
    }
  });

  it('returns promptly when foreground command spawns a background process inheriting stdout/stderr', async () => {
    const sandbox = createSandboxInstance();
    let capturedLogPath = '';
    sandbox.exec.mockImplementationOnce(async (script: string) => {
      const logMatch = script.match(/\/tmp\/fastgpt-bash-[A-Za-z0-9_-]+\.log/);
      capturedLogPath = logMatch?.[0] ?? '';
      const startedAt = Date.now();
      const proc = spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8', timeout: 5_000 });
      const elapsedMs = Date.now() - startedAt;
      // 前台命令打印 ready 后立即退出，后台子进程继承输出句柄不得阻塞工具返回。
      expect(elapsedMs).toBeLessThan(1_000);
      return {
        stdout: proc.stdout,
        stderr: proc.stderr,
        exitCode: proc.status ?? 1,
        truncated: false
      };
    });

    try {
      const result = await sandboxShellTool.execute({
        sandboxInstance: sandbox,
        params: { command: '(sleep 0.15; printf "BG_LATE_WRITE\\n") & echo ready' }
      });

      expect(result.response.trim()).toBe('ready');
      expect(capturedLogPath).toMatch(/^\/tmp\/fastgpt-bash-/);
      // 等待后台子进程晚写，验证既不落盘也不被遗留 fd 续写。
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(existsSync(capturedLogPath)).toBe(false);
    } finally {
      if (capturedLogPath) {
        spawnSync('rm', ['-f', capturedLogPath]);
      }
    }
  });

  it('returns promptly in exceeded mode when foreground command spawns a background process', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
    const limit = 1024 * 1024 * 1024;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ usedBytes: limit + 1024, limitBytes: limit }), {
          status: 200
        })
    ) as unknown as typeof fetch;

    const sandbox = createSandboxInstance({ withDiskProbe: true, id: 'sbx-docker-bg' });
    let capturedLogPath = '';
    sandbox.exec.mockImplementationOnce(async (script: string) => {
      expect(script).toContain('prlimit --fsize=0:0');
      const logMatch = script.match(/\/tmp\/fastgpt-bash-[A-Za-z0-9_-]+\.log/);
      capturedLogPath = logMatch?.[0] ?? '';
      // 在无 Linux prlimit 的宿主（如 macOS）剥离 prlimit 前缀，真实执行匿名管道采集与后台进程退出边界逻辑。
      const runnableScript = script.replaceAll(/prlimit --fsize=\d+:\d+ -- /g, '');
      const startedAt = Date.now();
      const proc = spawnSync('/bin/bash', ['-c', runnableScript], {
        encoding: 'utf8',
        timeout: 5_000
      });
      expect(Date.now() - startedAt).toBeLessThan(1_000);
      return {
        stdout: proc.stdout,
        stderr: proc.stderr,
        exitCode: proc.status ?? 1,
        truncated: false
      };
    });

    const result = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'sleep 2 & echo ready; exit 7' }
    });

    expect(result.response).toContain('ready');
    expect(result.response).toContain('Command exited with code 7');
    expect(result.response).toContain('RLIMIT_FSIZE=0');
    spawnSync('rm', ['-f', capturedLogPath]);
  });

  it('uses container effective limitBytes for prlimit when instance storageSizeGi changes', async () => {
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
    expect(executedScript).toContain(`prlimit --fsize=${containerLimit}:${containerLimit}`);
  });

  it('wraps commands with prlimit --fsize=limit:limit on docker normal mode', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 2;
    const expectedLimit = 2 * 1024 * 1024 * 1024;
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ usedBytes: 1024 }), { status: 200 })
    ) as unknown as typeof fetch;

    const sandbox = createSandboxInstance({ withDiskProbe: true, id: 'sbx-docker-normal' });
    const result = await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'echo hi' }
    });

    const [executedScript] = sandbox.exec.mock.calls[0]!;
    expect(executedScript).toContain(`prlimit --fsize=${expectedLimit}:${expectedLimit}`);
    expect(result.response).toBe('out');
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
    expect(firstScript).toContain('prlimit --fsize=0:0');
    expect(firstScript).toMatch(/^exec python3 -c /);
    expect(result.response).toContain('removed big.bin');
    expect(result.response).toContain('RLIMIT_FSIZE=0');
    expect(result.response).toContain('/home/sandbox');

    // 下次执行将向容器实时复核，容量降回上限以下后自动恢复正常单文件配额。
    await sandboxShellTool.execute({
      sandboxInstance: sandbox,
      params: { command: 'echo ok' }
    });
    const [secondScript] = sandbox.exec.mock.calls[1]!;
    expect(secondScript).toContain(`prlimit --fsize=${limit}:${limit}`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('keeps the tail of long output and points to the full output file', async () => {
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
      /\[Showing last 2000 of 2001 lines\. Saved log \(up to last 5 MiB\): \/tmp\/fastgpt-bash-[^.]+\.log\]/
    );
    expect(sandbox.opensandbox.deleteFiles).not.toHaveBeenCalled();
  });
});
