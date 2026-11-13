/**
 * 沙盒业务层：列出目录条目并输出稳定的纯文本列表。
 */
import { posix } from 'node:path';
import { DEFAULT_LS_LIMIT, SANDBOX_TOOL_MAX_BYTES, SANDBOX_TOOL_MAX_LINES } from '../../constants';
import z from 'zod';
import { trimSandboxPathRight } from '../../utils';
import { defineTool } from './type';
import { truncateSandboxToolOutput } from './utils';

export const SandboxLsToolSchema = z.object({
  path: z.string().optional(),
  limit: z.number().int().positive().max(5000).optional()
});

export const sandboxLsTool = defineTool({
  zodSchema: SandboxLsToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    const limit = params.limit ?? DEFAULT_LS_LIMIT;
    const { isWorkspaceRoot, entries } = await sandboxInstance.runWithRecovery(async () => {
      const targetPath = sandboxInstance.resolveRuntimePath(params.path, {
        allowAbsolutePath: true
      });
      const { workspaceRoot } = sandboxInstance.getRuntimePaths();
      return {
        isWorkspaceRoot: trimSandboxPathRight(targetPath) === trimSandboxPathRight(workspaceRoot),
        entries: await sandboxInstance.opensandbox.listDirectory(targetPath)
      };
    });
    const results = entries
      .map((entry) => ({
        name: posix.basename(entry.path),
        isDirectory: entry.type === 'directory'
      }))
      .filter(
        ({ name }) =>
          name && name !== '.' && name !== '..' && !(isWorkspaceRoot && name === '.fastgpt')
      )
      .map(({ name, isDirectory }) => `${name}${isDirectory ? '/' : ''}`)
      .sort((a, b) => a.localeCompare(b));

    if (results.length === 0) return { response: '(empty directory)' };

    const entryLimitReached = results.length > limit;
    const output = truncateSandboxToolOutput({
      content: results.slice(0, limit).join('\n'),
      direction: 'head'
    });
    const notices = [
      ...(entryLimitReached
        ? [`${limit} entries limit reached. Use limit=${Math.min(limit * 2, 5000)} for more`]
        : []),
      ...(output.truncated
        ? [
            output.truncatedBy === 'lines'
              ? `${SANDBOX_TOOL_MAX_LINES} lines limit reached`
              : `${SANDBOX_TOOL_MAX_BYTES} byte limit reached`
          ]
        : [])
    ];

    return {
      response: [output.content, notices.length > 0 ? `[${notices.join('. ')}]` : '']
        .filter(Boolean)
        .join('\n\n')
    };
  }
});
