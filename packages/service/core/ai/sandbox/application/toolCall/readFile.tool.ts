/**
 * 沙盒业务层：定义 sandbox 文件读取工具。
 *
 * 只描述工具参数和执行逻辑，运行态准备由 toolCall 编排层负责。
 */
import z from 'zod';
import { defineTool } from './type';
import { SANDBOX_TOOL_MAX_BYTES, truncateSandboxToolOutput } from './utils';

export const SandboxReadFileToolSchema = z.object({
  path: z.string(),
  offset: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional()
});

const decodeFileContent = (content: unknown) => {
  if (content instanceof Uint8Array) {
    return new TextDecoder('utf-8').decode(content);
  }
  return String(content ?? '');
};

export const sandboxReadFileTool = defineTool({
  zodSchema: SandboxReadFileToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    await sandboxInstance.ensureAvailable();

    const providerPath = sandboxInstance.resolveRuntimePath(params.path, {
      allowAbsolutePath: true
    });
    const [file] = await sandboxInstance.provider.readFiles([providerPath]);
    if (!file || file.error) {
      throw new Error(`Failed to read file: ${file?.error?.message || params.path}`);
    }

    const content = decodeFileContent(file.content);
    const lines = content.split(/\r\n|\n|\r/);
    const startLine = params.offset ?? 1;
    const startIndex = startLine - 1;
    if (startIndex >= lines.length) {
      throw new Error(`Offset ${startLine} is beyond end of file (${lines.length} lines total)`);
    }

    const selectedLines =
      params.limit === undefined
        ? lines.slice(startIndex)
        : lines.slice(startIndex, startIndex + params.limit);
    const firstLineBytes = Buffer.byteLength(selectedLines[0] ?? '', 'utf8');
    if (firstLineBytes > SANDBOX_TOOL_MAX_BYTES) {
      return {
        response: `[Line ${startLine} is ${firstLineBytes} bytes, exceeds ${SANDBOX_TOOL_MAX_BYTES} byte limit. Use sandbox_shell: sed -n '${startLine}p' ${params.path} | head -c ${SANDBOX_TOOL_MAX_BYTES}]`
      };
    }

    const output = truncateSandboxToolOutput({
      content: selectedLines.join('\n'),
      direction: 'head'
    });
    const endLine = startLine + output.outputLines - 1;
    const nextOffset = endLine + 1;
    const notice = (() => {
      if (output.truncated) {
        const byteLimit =
          output.truncatedBy === 'bytes' ? ` (${SANDBOX_TOOL_MAX_BYTES} byte limit)` : '';
        return `[Showing lines ${startLine}-${endLine} of ${lines.length}${byteLimit}. Use offset=${nextOffset} to continue.]`;
      }

      const consumedLines = selectedLines.length;
      const remainingLines = lines.length - (startIndex + consumedLines);
      if (params.limit !== undefined && remainingLines > 0) {
        return `[${remainingLines} more lines in file. Use offset=${startIndex + consumedLines + 1} to continue.]`;
      }
      return '';
    })();

    return {
      response: [output.content, notice].filter(Boolean).join('\n\n')
    };
  }
});
