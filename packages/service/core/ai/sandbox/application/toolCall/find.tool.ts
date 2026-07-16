/**
 * 沙盒业务层：使用 ripgrep 的文件枚举能力按 glob 查找路径。
 */
import z from 'zod';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { SANDBOX_FIND_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { defineTool } from './type';
import { SANDBOX_TOOL_MAX_BYTES, SANDBOX_TOOL_MAX_LINES, truncateSandboxToolOutput } from './utils';

const DEFAULT_FIND_LIMIT = 1000;

export const SandboxFindToolSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  limit: z.number().int().positive().max(5000).optional()
});

export const sandboxFindTool = defineTool({
  zodSchema: SandboxFindToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    await sandboxInstance.ensureAvailable();
    const limit = params.limit ?? DEFAULT_FIND_LIMIT;
    const searchPath = params.path ?? '.';
    const command = [
      `cd ${shellQuote(searchPath)}`,
      `rg --files --hidden --glob ${shellQuote(params.pattern)} -- . | head -n ${limit + 1}`
    ].join(' && ');
    const result = await sandboxInstance.exec(command);
    const paths = result.stdout
      .split('\n')
      .map((item) => item.trim().replace(/^\.\//, ''))
      .filter(Boolean);

    if (paths.length === 0) {
      if (result.stderr.trim()) throw new Error(result.stderr.trim());
      return { response: 'No files found matching pattern' };
    }

    const resultLimitReached = paths.length > limit;
    const output = truncateSandboxToolOutput({
      content: paths.slice(0, limit).join('\n'),
      direction: 'head'
    });
    const notices = [
      ...(resultLimitReached ? [`${limit} results limit reached`] : []),
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
  [SANDBOX_FIND_TOOL_NAME]: sandboxFindTool
};
