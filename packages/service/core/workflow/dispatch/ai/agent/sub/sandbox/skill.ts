/**
 * Agent Sandbox Tool Dispatch
 *
 * Implements the 5 sandbox tool dispatch functions that map
 * LLM tool calls to ISandbox operations.
 */

import type { AgentSandboxContext } from './types';
import type { z } from 'zod';
import type {
  SandboxReadFileSchema,
  SandboxWriteFileSchema,
  SandboxEditFileSchema,
  SandboxExecuteSchema,
  SandboxSearchSchema,
  SandboxFetchUserFileSchema
} from '@fastgpt/global/core/workflow/node/agent/skillTools';
import { pickOutboundAxios } from '../../../../../../../common/api/axios';
import path from 'path';

type DispatchResult = {
  response: string;
  usages: [];
};

/**
 * Read files from sandbox
 */
export async function dispatchSandboxReadFile(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxReadFileSchema>
): Promise<DispatchResult> {
  try {
    const files = await ctx.sandbox.readFiles(params.paths);

    if (!files || files.length === 0) {
      return { response: 'No files found', usages: [] };
    }

    const results = files.map((file: { path: string; content: Uint8Array | string }) => {
      const content =
        file.content instanceof Uint8Array
          ? new TextDecoder('utf-8').decode(file.content)
          : String(file.content);
      return `--- ${file.path} ---\n${content}`;
    });

    return { response: results.join('\n\n'), usages: [] };
  } catch (error) {
    return {
      response: `Failed to read files: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Write a file to sandbox
 */
export async function dispatchSandboxWriteFile(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxWriteFileSchema>
): Promise<DispatchResult> {
  try {
    await ctx.sandbox.writeFiles([
      {
        path: params.path,
        data: params.content
      }
    ]);

    return { response: `File written successfully: ${params.path}`, usages: [] };
  } catch (error) {
    return {
      response: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Edit files in sandbox using find-and-replace
 */
export async function dispatchSandboxEditFile(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxEditFileSchema>
): Promise<DispatchResult> {
  try {
    await ctx.sandbox.replaceContent(
      params.entries.map((e) => ({
        path: e.path,
        oldContent: e.oldContent,
        newContent: e.newContent
      }))
    );

    const editedPaths = params.entries.map((e) => e.path).join(', ');
    return { response: `Files edited successfully: ${editedPaths}`, usages: [] };
  } catch (error) {
    return {
      response: `Failed to edit files: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Execute a shell command in sandbox
 */
export async function dispatchSandboxExecute(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxExecuteSchema>
): Promise<DispatchResult> {
  try {
    const result = await ctx.sandbox.execute(params.command, {
      workingDirectory: params.workingDirectory,
      timeoutMs: params.timeoutMs
    });

    const parts: string[] = [];
    parts.push(`Exit code: ${result.exitCode}`);
    if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
    if (result.stderr) parts.push(`stderr:\n${result.stderr}`);

    return { response: parts.join('\n'), usages: [] };
  } catch (error) {
    return {
      response: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Search files in sandbox
 */
export async function dispatchSandboxSearch(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxSearchSchema>
): Promise<DispatchResult> {
  try {
    const results = await ctx.sandbox.search(params.pattern, params.path);

    if (!results || results.length === 0) {
      return { response: 'No matching files found', usages: [] };
    }

    const paths = results
      .map((r: string | { path: string }) => (typeof r === 'string' ? r : r.path))
      .join('\n');
    return { response: `Matching files:\n${paths}`, usages: [] };
  } catch (error) {
    return {
      response: `Failed to search files: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Fetch a user-uploaded file (from conversation) and write it into the sandbox filesystem
 */

/**
 * Resolve target_path to an absolute path within workDirectory.
 * Strips leading slash if present, then resolves and validates no traversal.
 * Returns null if the resolved path escapes workDirectory.
 */
function resolveTargetPath(targetPath: string, workDirectory: string): string | null {
  // Strip leading slash if provided (LLM might still send absolute path)
  const relative = targetPath.startsWith('/') ? targetPath.slice(1) : targetPath;

  // Resolve to absolute, then verify it's within workDirectory
  const resolved = path.resolve(workDirectory, relative);
  if (!resolved.startsWith(workDirectory + '/') && resolved !== workDirectory) {
    return null; // Path traversal detected
  }
  return resolved;
}

export async function dispatchSandboxFetchUserFile(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxFetchUserFileSchema>,
  allFilesMap: Record<string, { url: string; name: string; type: string }>
): Promise<DispatchResult> {
  const fileEntry = allFilesMap[params.file_index];
  if (!fileEntry) {
    return {
      response: `Failed: file index "${params.file_index}" not found in available_files`,
      usages: []
    };
  }

  const resolvedPath = resolveTargetPath(params.target_path, ctx.workDirectory);
  if (!resolvedPath) {
    return {
      response: `Failed: target_path "${params.target_path}" is invalid or attempts to escape workspace.`,
      usages: []
    };
  }

  // 拒绝 ws/wss 协议进入文件下载链路
  if (/^wss?:/i.test(fileEntry.url)) {
    return {
      response: `Failed: ws/wss protocol is not allowed for file URL`,
      usages: []
    };
  }

  try {
    const response = await pickOutboundAxios(fileEntry.url).get(fileEntry.url, {
      responseType: 'arraybuffer'
    });
    const buffer: ArrayBuffer = response.data;

    await ctx.sandbox.writeFiles([{ path: resolvedPath, data: buffer }]);

    return {
      response: `File written to sandbox: ${resolvedPath} (name: ${fileEntry.name}, size: ${buffer.byteLength} bytes)`,
      usages: []
    };
  } catch (error) {
    return {
      response: `Failed to fetch user file: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}
