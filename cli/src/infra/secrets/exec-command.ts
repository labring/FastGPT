import { spawn } from 'node:child_process';

export const DEFAULT_EXEC_TIMEOUT_MS = 10_000;

export type ExecCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type ExecCommandFn = (params: {
  command: string;
  args: string[];
  stdin?: string;
  timeoutMs?: number;
}) => Promise<ExecCommandResult>;

/**
 * 轻量子进程执行封装，供系统 Keychain 命令调用与单测注入复用；
 * 绑定 stdin 错误监听防止提前退出触发未捕获 EPIPE，并提供超时保护避免密钥环弹窗阻塞。
 */
export function execSystemCommand({
  command,
  args,
  stdin,
  timeoutMs = DEFAULT_EXEC_TIMEOUT_MS
}: {
  command: string;
  args: string[];
  stdin?: string;
  timeoutMs?: number;
}): Promise<ExecCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const finish = (result: ExecCommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      finish({
        code: 124,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: `Command timed out after ${timeoutMs}ms`
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    // 子进程启动失败或提前退出时，向 stdin 写入会触发 EPIPE，此处吞掉流错误交给 error/close 处理。
    child.stdin.on('error', () => {});

    child.on('error', (error: NodeJS.ErrnoException) => {
      finish({
        code: error.code === 'ENOENT' ? 127 : 1,
        stdout: '',
        stderr: error.message
      });
    });

    child.on('close', (code) => {
      if (timedOut) {
        return;
      }
      finish({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8')
      });
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}
