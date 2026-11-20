/**
 * 沙盒业务层：定义 sandbox shell 执行工具。
 *
 * 只描述工具参数和执行逻辑，运行态准备由 toolCall 编排层负责。
 */
import z from 'zod';
import { defineTool } from './type';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { SANDBOX_TOOL_MAX_BYTES, SANDBOX_TOOL_MAX_LINES } from '../../constants';
import { formatAgentDiskQuotaNotice, getSandboxDiskQuotaStatus } from '../quota';
import { truncateSandboxToolOutput } from './utils';

export const SANDBOX_SHELL_LOG_MAX_BYTES = 5 * 1024 * 1024;
export const SANDBOX_SHELL_LOG_MAX_FILES = 10;

// 单进程 python3 父进程以匿名管道收集输出：
// 1) 运行期全程在内存维护最近 maxBytes 字节，超时/强杀时 /tmp 不留临时文件；
// 2) 仅在输出超过工具截断阈值时才落盘并淘汰旧日志，常规小输出零磁盘写入；
// 3) 前台命令退出后即排空并关闭读端，不阻塞继承 stdout/stderr 的后台进程；
// 4) 收到 TERM/INT/HUP 时按进程组终止子进程，避免超时命令残留孤儿进程。
const SHELL_RUNNER_PY = [
  'import glob, os, select, signal, subprocess, sys, time',
  'log_path, cap, max_lines, max_bytes, max_files = (',
  '    sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])',
  ')',
  'proc = subprocess.Popen(',
  '    sys.argv[6:], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0, start_new_session=True',
  ')',
  'def on_sig(sig, _):',
  '    try:',
  '        os.killpg(proc.pid, sig)',
  '    except OSError:',
  '        pass',
  '    sys.exit(128 + sig)',
  'for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):',
  '    signal.signal(s, on_sig)',
  'fd, buf, total, exited_at = proc.stdout.fileno(), bytearray(), 0, None',
  'while True:',
  '    exited = proc.poll() is not None',
  '    ready, _, _ = select.select([fd], [], [], 0.0 if exited else 0.02)',
  '    if ready:',
  '        chunk = os.read(fd, 65536)',
  '        if not chunk:',
  '            break',
  '        total += len(chunk)',
  '        buf.extend(chunk)',
  '        if len(buf) > cap * 2:',
  '            del buf[:-cap]',
  '        if exited:',
  '            exited_at = exited_at or time.monotonic()',
  '            if time.monotonic() - exited_at > 0.05:',
  '                break',
  '    elif exited:',
  '        break',
  'proc.stdout.close()',
  'rc = proc.wait()',
  'if rc < 0:',
  '    rc = 128 - rc',
  'if len(buf) > cap:',
  '    del buf[:-cap]',
  "lines = buf.count(b'\\n') + (1 if buf and not buf.endswith(b'\\n') else 0)",
  'if total > max_bytes or lines > max_lines:',
  "    with open(log_path, 'wb') as f:",
  '        f.write(buf)',
  '    logs = []',
  "    for p in glob.glob('/tmp/fastgpt-bash-*.log'):",
  '        try:',
  '            logs.append((os.path.getmtime(p), p))',
  '        except OSError:',
  '            pass',
  '    logs.sort(reverse=True)',
  '    for _, old in logs[max_files:]:',
  '        try:',
  '            os.unlink(old)',
  '        except OSError:',
  '            pass',
  'sys.stdout.buffer.write(buf)',
  'sys.stdout.buffer.flush()',
  'sys.exit(rc)'
].join('\n');

const SandboxShellToolSchema = z.object({
  command: z.string(),
  timeout: z.number().int().min(1).max(600).optional()
});

export const sandboxShellTool = defineTool({
  zodSchema: SandboxShellToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    // 1. Docker 运行时检查持久卷配额：正常态按 storageSizeGi 封顶单文件，超限态自动降级为 0:0 只读删模式。
    // 不提前调 ensureAvailable()，保留 sandboxInstance.exec() 对不可用/已删除源的优雅降级返回契约。
    const quotaStatus = await getSandboxDiskQuotaStatus(sandboxInstance.opensandbox);
    const fsizeLimit = (() => {
      if (!quotaStatus.enabled) return undefined;
      return quotaStatus.exceeded ? 0 : quotaStatus.limitBytes;
    })();

    const fullOutputPath = `/tmp/fastgpt-bash-${getNanoid(12)}.log`;
    const execCommand = [
      'exec',
      'python3',
      '-c',
      shellQuote(SHELL_RUNNER_PY),
      shellQuote(fullOutputPath),
      String(SANDBOX_SHELL_LOG_MAX_BYTES),
      String(SANDBOX_TOOL_MAX_LINES),
      String(SANDBOX_TOOL_MAX_BYTES),
      String(SANDBOX_SHELL_LOG_MAX_FILES),
      ...(fsizeLimit === undefined ? [] : ['prlimit', `--fsize=${fsizeLimit}:${fsizeLimit}`, '--']),
      '/bin/bash',
      '-c',
      shellQuote(params.command)
    ].join(' ');

    const result = await sandboxInstance.exec(execCommand, params.timeout);

    const rawOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const output = truncateSandboxToolOutput({ content: rawOutput, direction: 'tail' });
    const truncationNotice = (() => {
      if (!output.truncated && !result.truncated) return '';
      const logCapMiB = Math.round(SANDBOX_SHELL_LOG_MAX_BYTES / (1024 * 1024));
      const logLocation = `Saved log (up to last ${logCapMiB} MiB): ${fullOutputPath}`;
      if (output.truncatedBy === 'lines') {
        return `[Showing last ${output.outputLines} of ${output.totalLines} lines. ${logLocation}]`;
      }
      return `[Showing last ${output.outputBytes} bytes of output. ${logLocation}]`;
    })();
    const exitNotice =
      result.exitCode === 0 || result.exitCode === null
        ? ''
        : `Command exited with code ${result.exitCode}`;
    const quotaNotice = quotaStatus.exceeded
      ? formatAgentDiskQuotaNotice(quotaStatus, 'shell')
      : '';

    return {
      response: [output.content, truncationNotice, exitNotice, quotaNotice]
        .filter(Boolean)
        .join('\n\n')
    };
  }
});
