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
import { getAgentSandboxOpenSandboxConfig } from '../../config';
import {
  formatAgentDiskQuotaNotice,
  getSandboxDiskQuotaStatus,
  type SandboxDiskQuotaStatus
} from '../quota';
import { truncateSandboxToolOutput } from './utils';

export const SANDBOX_SHELL_LOG_MAX_BYTES = 5 * 1024 * 1024;
export const SANDBOX_SHELL_LOG_MAX_FILES = 10;

// 单进程 python3 父进程以匿名管道收集输出：
// 1) 运行期全程在内存维护最近 maxBytes 字节，超时/强杀时 /tmp 不留临时文件并在 SIGTERM 前冲刷尾部输出；
// 2) 仅在输出超过工具截断阈值时才落盘并淘汰旧日志（写失败时在 metadata 中标记 saved=false 而不伪造路径），stdout 只吐有界尾部；
// 3) 前台命令退出后即排空并关闭读端，不阻塞继承 stdout/stderr 的后台进程；
// 4) 收到 TERM/INT/HUP 时按进程组终止子进程，避免超时命令残留孤儿进程。
const SHELL_RUNNER_PY = [
  'import glob, json, os, select, signal, subprocess, sys, time',
  'log_path, cap, max_lines, max_bytes, max_files, meta_marker = (',
  '    sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]',
  ')',
  'proc = subprocess.Popen(',
  '    sys.argv[7:], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0, start_new_session=True',
  ')',
  'def take_tail(b):',
  '    if not b:',
  '        return b"", "lines", 0',
  '    lines = b.split(b"\\n")',
  '    if b.endswith(b"\\n"):',
  '        lines.pop()',
  '    sel, used, by = [], 0, "lines"',
  '    for ln in reversed(lines):',
  '        if len(sel) >= max_lines:',
  '            break',
  '        need = len(ln) + (1 if sel else 0)',
  '        if used + need > max_bytes:',
  '            by = "bytes"',
  '            if not sel:',
  '                tail = ln[-max_bytes:]',
  '                while tail and (tail[0] & 0xC0) == 0x80:',
  '                    tail = tail[1:]',
  '                sel.append(tail)',
  '            break',
  '        sel.append(ln)',
  '        used += need',
  '    sel.reverse()',
  '    return b"\\n".join(sel), by, len(sel)',
  'fd, buf, total, total_lines, ended_nl, exited_at = proc.stdout.fileno(), bytearray(), 0, 0, True, None',
  'def on_sig(sig, _):',
  '    try:',
  '        os.killpg(proc.pid, sig)',
  '    except OSError:',
  '        pass',
  '    try:',
  '        tail_bytes, _, _ = take_tail(bytes(buf[-cap:]))',
  '        if tail_bytes:',
  '            sys.stdout.buffer.write(tail_bytes)',
  '            sys.stdout.buffer.flush()',
  '    except OSError:',
  '        pass',
  '    sys.exit(128 + sig)',
  'for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):',
  '    signal.signal(s, on_sig)',
  'while True:',
  '    exited = proc.poll() is not None',
  '    ready, _, _ = select.select([fd], [], [], 0.0 if exited else 0.02)',
  '    if ready:',
  '        chunk = os.read(fd, 65536)',
  '        if not chunk:',
  '            break',
  '        total += len(chunk)',
  '        total_lines += chunk.count(b"\\n")',
  '        ended_nl = chunk.endswith(b"\\n")',
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
  'if total > 0 and not ended_nl:',
  '    total_lines += 1',
  'if len(buf) > cap:',
  '    del buf[:-cap]',
  'truncated = total > max_bytes or total_lines > max_lines',
  'if truncated:',
  '    tail_bytes, by, out_lines = take_tail(bytes(buf))',
  '    sys.stdout.buffer.write(tail_bytes)',
  '    saved = False',
  '    try:',
  '        with open(log_path, "wb") as f:',
  '            f.write(buf)',
  '        saved = True',
  '        logs = []',
  '        for p in glob.glob("/tmp/fastgpt-bash-*.log"):',
  '            try:',
  '                logs.append((os.path.getmtime(p), p))',
  '            except OSError:',
  '                pass',
  '        logs.sort(reverse=True)',
  '        for _, old in logs[max_files:]:',
  '            try:',
  '                os.unlink(old)',
  '            except OSError:',
  '                pass',
  '    except OSError:',
  '        pass',
  '    meta = {"truncatedBy": by, "totalLines": total_lines, "outputLines": out_lines, "outputBytes": len(tail_bytes), "saved": saved}',
  '    sys.stdout.buffer.write(f"\\n{meta_marker}{json.dumps(meta)}".encode("utf-8"))',
  'else:',
  '    sys.stdout.buffer.write(buf)',
  'sys.stdout.buffer.flush()',
  'sys.exit(rc)'
].join('\n');

type ShellRunnerMeta = {
  truncatedBy?: 'lines' | 'bytes';
  totalLines: number;
  outputLines: number;
  outputBytes: number;
  saved: boolean;
};

const extractShellRunnerMeta = (stdout: string, metaMarker: string) => {
  const markerToken = `\n${metaMarker}`;
  const markerIndex = stdout.lastIndexOf(markerToken);
  if (markerIndex === -1) return { stdout, meta: undefined };

  const rawMeta = stdout.slice(markerIndex + markerToken.length).trim();
  try {
    const parsed = JSON.parse(rawMeta) as ShellRunnerMeta;
    return { stdout: stdout.slice(0, markerIndex), meta: parsed };
  } catch {
    return { stdout, meta: undefined };
  }
};

const SandboxShellToolSchema = z.object({
  command: z.string(),
  timeout: z.number().int().min(1).max(600).optional()
});

export const sandboxShellTool = defineTool({
  zodSchema: SandboxShellToolSchema,
  skipEnsureAvailable: true,
  execute: async ({ sandboxInstance, params }) => {
    // 1. Docker 运行时在自愈上下文中确认容器可用后再探测配额，防止已回收容器绕过 RLIMIT_FSIZE；
    //    非可恢复/不可用错误捕获后继续交由 sandboxInstance.exec() 统一降级返回 ExecuteResult。
    let quotaStatus: SandboxDiskQuotaStatus | undefined;
    if (getAgentSandboxOpenSandboxConfig().runtime === 'docker') {
      try {
        quotaStatus = await sandboxInstance.runWithRecovery(() =>
          getSandboxDiskQuotaStatus(sandboxInstance.opensandbox, { rethrowRecoverable: true })
        );
      } catch {
        quotaStatus = undefined;
      }
    }
    const fsizeLimit = (() => {
      if (!quotaStatus?.enabled) return undefined;
      return quotaStatus.exceeded ? 0 : quotaStatus.limitBytes;
    })();

    const fullOutputPath = `/tmp/fastgpt-bash-${getNanoid(12)}.log`;
    const metaMarker = `__FASTGPT_SHELL_META_${getNanoid(12)}__`;
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
      shellQuote(metaMarker),
      ...(fsizeLimit === undefined ? [] : ['prlimit', `--fsize=${fsizeLimit}:${fsizeLimit}`, '--']),
      '/bin/bash',
      '-c',
      shellQuote(params.command)
    ].join(' ');

    const result = await sandboxInstance.exec(execCommand, params.timeout);

    const extracted = extractShellRunnerMeta(result.stdout, metaMarker);
    const rawOutput = [extracted.stdout, result.stderr].filter(Boolean).join('\n');
    const runnerMeta = extracted.meta;
    const output = runnerMeta
      ? {
          content: rawOutput,
          truncated: true,
          truncatedBy: runnerMeta.truncatedBy,
          totalLines: runnerMeta.totalLines,
          outputLines: runnerMeta.outputLines,
          outputBytes: runnerMeta.outputBytes
        }
      : truncateSandboxToolOutput({ content: rawOutput, direction: 'tail' });
    const truncationNotice = (() => {
      if (!output.truncated && !result.truncated) return '';
      const logCapMiB = Math.round(SANDBOX_SHELL_LOG_MAX_BYTES / (1024 * 1024));
      const logSaved = runnerMeta ? runnerMeta.saved : true;
      const logLocation = logSaved
        ? `Saved log (up to last ${logCapMiB} MiB): ${fullOutputPath}`
        : `Full output log could not be saved to ${fullOutputPath}`;
      if (output.truncatedBy === 'lines') {
        return `[Showing last ${output.outputLines} of ${output.totalLines} lines. ${logLocation}]`;
      }
      return `[Showing last ${output.outputBytes} bytes of output. ${logLocation}]`;
    })();
    const exitNotice =
      result.exitCode === 0 || result.exitCode === null
        ? ''
        : `Command exited with code ${result.exitCode}`;
    const quotaNotice = quotaStatus?.exceeded
      ? formatAgentDiskQuotaNotice(quotaStatus, 'shell')
      : '';

    return {
      response: [output.content, truncationNotice, exitNotice, quotaNotice]
        .filter(Boolean)
        .join('\n\n')
    };
  }
});
