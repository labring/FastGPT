/**
 * 沙盒业务层：定义 sandbox shell 执行工具。
 *
 * 只描述工具参数和执行逻辑，运行态准备由 toolCall 编排层负责。
 */
import z from 'zod';
import { defineTool } from './type';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { getAgentSandboxOpenSandboxConfig } from '../../config';
import {
  formatAgentDiskQuotaNotice,
  getSandboxDiskQuotaStatus,
  type SandboxDiskQuotaStatus
} from '../quota';
import { truncateSandboxToolOutput } from './utils';

const SandboxShellToolSchema = z.object({
  command: z.string(),
  timeout: z.number().int().min(1).max(600).optional()
});

// 略高于 SANDBOX_TOOL_MAX_BYTES (50 KiB)，保证远端写出 execd 临时文件严格有界且 App 侧有足够 UTF-8 裁剪余量。
export const SANDBOX_SHELL_REMOTE_OUTPUT_MAX_BYTES = 64 * 1024;

export const sandboxShellTool = defineTool({
  zodSchema: SandboxShellToolSchema,
  skipEnsureAvailable: true,
  execute: async ({ sandboxInstance, params, signal }) => {
    // 1. Docker 运行时在自愈上下文中确认容器可用后再探测配额，防止已回收容器绕过 RLIMIT_FSIZE；
    //    非可恢复/不可用错误捕获后继续交由 sandboxInstance.exec() 统一降级返回 ExecuteResult。
    let quotaStatus: SandboxDiskQuotaStatus | undefined;
    if (getAgentSandboxOpenSandboxConfig().runtime === 'docker') {
      try {
        quotaStatus = await sandboxInstance.runWithRecovery(
          () =>
            getSandboxDiskQuotaStatus(sandboxInstance.opensandbox, {
              rethrowRecoverable: true,
              signal
            }),
          signal ? { signal } : undefined
        );
      } catch {
        quotaStatus = undefined;
      }
    }
    const fsizeLimit = (() => {
      if (!quotaStatus?.enabled) return undefined;
      return quotaStatus.exceeded ? 0 : quotaStatus.limitBytes;
    })();

    const quotedCommand = shellQuote(params.command);
    const innerCommand = (() => {
      if (fsizeLimit === undefined) {
        return `/bin/bash -c ${quotedCommand}`;
      }
      if (fsizeLimit > 0) {
        return `prlimit --fsize=${fsizeLimit}:${fsizeLimit} -- /bin/bash -c ${quotedCommand}`;
      }
      // 仅 RLIMIT_FSIZE=0 时写 execd 普通日志会触发 SIGXFSZ (153)，统一经管道 tail -c 避免写满 execd 临时空间并保留真实退出码。
      return `prlimit --fsize=0:0 -- /bin/bash -c ${quotedCommand}`;
    })();
    const execCommand = `${innerCommand} 2>&1 | tail -c ${SANDBOX_SHELL_REMOTE_OUTPUT_MAX_BYTES}; exit "\${PIPESTATUS[0]}"`;

    const execOptions =
      params.timeout !== undefined || signal !== undefined
        ? {
            ...(params.timeout !== undefined ? { timeout: params.timeout } : {}),
            ...(signal !== undefined ? { signal } : {})
          }
        : undefined;
    const result = execOptions
      ? await sandboxInstance.exec(execCommand, execOptions)
      : await sandboxInstance.exec(execCommand);

    const rawOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const remoteTailTruncated =
      Buffer.byteLength(rawOutput, 'utf8') >= SANDBOX_SHELL_REMOTE_OUTPUT_MAX_BYTES;
    const output = truncateSandboxToolOutput({ content: rawOutput, direction: 'tail' });
    const truncationNotice = (() => {
      if (!output.truncated && !result.truncated && !remoteTailTruncated) return '';
      const hint = 'Redirect output to a file if you need full logs.';
      if (!remoteTailTruncated && output.truncatedBy === 'lines') {
        return `[Showing last ${output.outputLines} of ${output.totalLines} lines. ${hint}]`;
      }
      return `[Showing last ${output.outputBytes} bytes of output. ${hint}]`;
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
