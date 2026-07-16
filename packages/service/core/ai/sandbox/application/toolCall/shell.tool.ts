/**
 * 沙盒业务层：定义 sandbox shell 执行工具。
 *
 * 只描述工具参数和执行逻辑，运行态准备由 toolCall 编排层负责。
 */
import z from 'zod';
import { defineTool } from './type';
import { SANDBOX_SHELL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { truncateSandboxToolOutput } from './utils';

const SandboxShellToolSchema = z.object({
  command: z.string(),
  timeout: z.number().int().min(1).max(600).optional()
});

export const sandboxShellTool = defineTool({
  zodSchema: SandboxShellToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    const fullOutputPath = `/tmp/fastgpt-bash-${getNanoid(12)}.log`;
    const result = await sandboxInstance.exec(
      [
        `/bin/bash -c ${shellQuote(params.command)} > ${shellQuote(fullOutputPath)} 2>&1`,
        'exit_code=$?',
        `cat ${shellQuote(fullOutputPath)}`,
        'exit "$exit_code"'
      ].join('\n'),
      params.timeout
    );
    const rawOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const output = truncateSandboxToolOutput({ content: rawOutput, direction: 'tail' });
    const truncationNotice = (() => {
      if (!output.truncated && !result.truncated) return '';
      if (output.truncatedBy === 'lines') {
        return `[Showing last ${output.outputLines} of ${output.totalLines} lines. Full output: ${fullOutputPath}]`;
      }
      return `[Showing last ${output.outputBytes} bytes of output. Full output: ${fullOutputPath}]`;
    })();
    const exitNotice =
      result.exitCode === 0 || result.exitCode === null
        ? ''
        : `Command exited with code ${result.exitCode}`;

    if (!output.truncated && !result.truncated) {
      await sandboxInstance.provider.deleteFiles([fullOutputPath]).catch(() => {});
    }

    return {
      response: [output.content, truncationNotice, exitNotice].filter(Boolean).join('\n\n')
    };
  }
});

export const toolMap = {
  [SANDBOX_SHELL_TOOL_NAME]: sandboxShellTool
};
