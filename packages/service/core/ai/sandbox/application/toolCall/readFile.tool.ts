/**
 * 沙盒业务层：定义 sandbox 文件读取工具。
 *
 * 只描述工具参数和执行逻辑，运行态准备由 toolCall 编排层负责。
 */
import z from 'zod';
import { defineTool } from './type';
import { SANDBOX_TOOL_MAX_BYTES, SANDBOX_TOOL_MAX_LINES } from '../../constants';

const SandboxReadFileToolSchema = z.object({
  path: z.string(),
  offset: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional()
});

export const sandboxReadFileTool = defineTool({
  zodSchema: SandboxReadFileToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    // 显式放开只读内置 Skill 等受控目录（如 /var/lib/fastgpt-runtime/skills）。
    const providerPath = sandboxInstance.resolveRuntimePath(params.path, {
      allowAbsolutePath: true,
      allowOutsideWorkspace: true
    });
    const startLine = params.offset ?? 1;
    const requestLimit = Math.min(params.limit ?? SANDBOX_TOOL_MAX_LINES, SANDBOX_TOOL_MAX_LINES);

    // 多请求 1 行探测是否有后续内容；原始字节超上限即断流（加行号后必超限，末行残片不会被输出）。
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      const stream = sandboxInstance.opensandbox.readFileStream(providerPath, {
        offset: startLine,
        limit: requestLimit + 1
      });
      for await (const chunk of stream) {
        const remaining = SANDBOX_TOOL_MAX_BYTES + 1 - totalBytes;
        if (chunk.byteLength >= remaining) {
          chunks.push(chunk.subarray(0, remaining));
          totalBytes += remaining;
          break;
        }
        chunks.push(chunk);
        totalBytes += chunk.byteLength;
      }
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error && error.message ? error.message : params.path}`,
        { cause: error }
      );
    }

    const content = new TextDecoder('utf-8', { ignoreBOM: startLine > 1 }).decode(
      Buffer.concat(chunks, totalBytes)
    );
    if (content.length === 0) {
      return {
        response:
          startLine === 1
            ? `[File exists but is empty: ${params.path}]`
            : `[File exists but has no content at or after offset ${startLine}: ${params.path}]`
      };
    }

    const lines = content.split('\n');
    const maxLines = Math.min(lines.length, requestLimit);
    const outputLines: string[] = [];
    let outputBytes = 0;
    for (let i = 0; i < maxLines; i += 1) {
      const formatted = `${startLine + i}→${lines[i]}`;
      const lineBytes = Buffer.byteLength(formatted, 'utf8') + (outputLines.length > 0 ? 1 : 0);
      if (outputBytes + lineBytes > SANDBOX_TOOL_MAX_BYTES) break;
      outputLines.push(formatted);
      outputBytes += lineBytes;
    }

    if (outputLines.length === 0) {
      return {
        response: `[Line ${startLine} exceeds ${SANDBOX_TOOL_MAX_BYTES} byte limit. Use sandbox_shell: sed -n '${startLine}p' ${params.path} | head -c ${SANDBOX_TOOL_MAX_BYTES}]`
      };
    }

    const endLine = startLine + outputLines.length - 1;
    const notice =
      outputLines.length < lines.length
        ? `[Showing lines ${startLine}-${endLine}${outputLines.length < maxLines ? ` (${SANDBOX_TOOL_MAX_BYTES} byte limit)` : ''}. Use offset=${endLine + 1} to continue.]`
        : '';

    return {
      response: [outputLines.join('\n'), notice].filter(Boolean).join('\n\n')
    };
  }
});
