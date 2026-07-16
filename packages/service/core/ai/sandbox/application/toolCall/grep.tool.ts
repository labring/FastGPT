/**
 * 沙盒业务层：使用 ripgrep 搜索文件内容并输出适合模型阅读的匹配行。
 */
import z from 'zod';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { SANDBOX_GREP_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { defineTool } from './type';
import { SANDBOX_TOOL_MAX_BYTES, SANDBOX_TOOL_MAX_LINES, truncateSandboxToolOutput } from './utils';

const DEFAULT_GREP_LIMIT = 100;
const MAX_GREP_LINE_CHARS = 500;

export const SandboxGrepToolSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  glob: z.string().optional(),
  ignoreCase: z.boolean().optional(),
  literal: z.boolean().optional(),
  context: z.number().int().min(0).optional(),
  limit: z.number().int().positive().max(1000).optional()
});

const truncateMatchLine = (line: string) => {
  const chars = Array.from(line);
  return chars.length > MAX_GREP_LINE_CHARS
    ? { text: `${chars.slice(0, MAX_GREP_LINE_CHARS).join('')}... [truncated]`, truncated: true }
    : { text: line, truncated: false };
};

export const sandboxGrepTool = defineTool({
  zodSchema: SandboxGrepToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    await sandboxInstance.ensureAvailable();
    const limit = params.limit ?? DEFAULT_GREP_LIMIT;
    const rgArgs = [
      'rg',
      '--json',
      '--line-number',
      '--no-heading',
      '--color',
      'never',
      '--hidden',
      ...(params.ignoreCase ? ['--ignore-case'] : []),
      ...(params.literal ? ['--fixed-strings'] : []),
      ...(params.glob ? ['--glob', params.glob] : []),
      ...(params.context !== undefined ? ['--context', String(params.context)] : []),
      '--',
      params.pattern,
      params.path ?? '.'
    ];
    // awk 在第 N 个 match 事件后停止，避免 rg 在大量匹配时撑满 provider 输出缓冲区。
    const awkScript = `{ print } /\"type\":\"match\"/ { count++; if (count >= ${limit}) exit }`;
    const command = `${rgArgs.map(shellQuote).join(' ')} | awk ${shellQuote(awkScript)}`;
    const result = await sandboxInstance.exec(command);

    const outputLines: string[] = [];
    let matchCount = 0;
    let linesTruncated = false;
    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as {
          type?: string;
          data?: {
            path?: { text?: string };
            lines?: { text?: string };
            line_number?: number;
          };
        };
        if (event.type !== 'match' && event.type !== 'context') continue;
        if (event.type === 'match') matchCount += 1;
        const filePath = event.data?.path?.text ?? '';
        const lineNumber = event.data?.line_number ?? 0;
        const lineResult = truncateMatchLine((event.data?.lines?.text ?? '').replace(/\r?\n$/, ''));
        if (lineResult.truncated) linesTruncated = true;
        const separator = event.type === 'match' ? ':' : '-';
        outputLines.push(`${filePath}${separator}${lineNumber}${separator} ${lineResult.text}`);
      } catch {
        // rg 的非 JSON 行不属于匹配结果，忽略即可。
      }
    }

    if (outputLines.length === 0) {
      if (result.stderr.trim()) throw new Error(result.stderr.trim());
      return { response: 'No matches found' };
    }

    const output = truncateSandboxToolOutput({
      content: outputLines.join('\n'),
      direction: 'head'
    });
    const notices = [
      ...(matchCount >= limit
        ? [
            `${limit} matches limit reached. Use limit=${Math.min(limit * 2, 1000)} for more, or refine pattern`
          ]
        : []),
      ...(output.truncated
        ? [
            output.truncatedBy === 'lines'
              ? `${SANDBOX_TOOL_MAX_LINES} lines limit reached`
              : `${SANDBOX_TOOL_MAX_BYTES} byte limit reached`
          ]
        : []),
      ...(linesTruncated
        ? [
            `Some lines truncated to ${MAX_GREP_LINE_CHARS} chars. Use sandbox_read_file to see full lines`
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
  [SANDBOX_GREP_TOOL_NAME]: sandboxGrepTool
};
