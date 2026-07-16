/**
 * 沙盒业务层：列出目录条目并输出稳定的纯文本列表。
 */
import z from 'zod';
import { SANDBOX_LS_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { defineTool } from './type';
import { SANDBOX_TOOL_MAX_BYTES, SANDBOX_TOOL_MAX_LINES, truncateSandboxToolOutput } from './utils';

const DEFAULT_LS_LIMIT = 500;

export const SandboxLsToolSchema = z.object({
  path: z.string().optional(),
  limit: z.number().int().positive().max(5000).optional()
});

export const sandboxLsTool = defineTool({
  zodSchema: SandboxLsToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    await sandboxInstance.ensureAvailable();
    const limit = params.limit ?? DEFAULT_LS_LIMIT;
    const entries = await sandboxInstance.provider.listDirectory(params.path ?? '.');
    const results = entries
      .map((entry) => `${entry.name}${entry.isDirectory ? '/' : ''}`)
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

export const toolMap = {
  [SANDBOX_LS_TOOL_NAME]: sandboxLsTool
};
