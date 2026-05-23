import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/service/runtime';
import {
  SandboxFileOpBodySchema,
  type SandboxFileOpBody,
  type SandboxFileOpResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { resolveSandboxWorkspacePath } from '@/service/core/sandbox/fileService';

/**
 * 执行 SandboxEditor 的文件操作。
 *
 * API 边界只负责把用户态相对路径解析到 sandbox workspace，并通过 provider 文件系统
 * 能力完成 mkdir/delete/move/copy。这里刻意不再拼 shell 命令，避免文件名中的括号、
 * @、#、空格等正常字符被误拦，也避免重新引入命令注入风险。
 */
export const runSandboxFileOperation = async ({
  sandbox,
  type,
  path,
  destPath
}: {
  sandbox: SandboxClient;
  type: SandboxFileOpBody['type'];
  path: string;
  destPath?: string;
}) => {
  const MAX_COPY_DEPTH = 20;

  const trimPathRight = (value: string) => (value === '/' ? '' : value.replace(/\/+$/, ''));

  const getParentDirectory = (path: string) => {
    const normalizedPath = trimPathRight(path);
    const lastSlash = normalizedPath.lastIndexOf('/');
    if (lastSlash <= 0) return undefined;
    return normalizedPath.slice(0, lastSlash);
  };

  const joinProviderPath = (basePath: string, name: string) => `${trimPathRight(basePath)}/${name}`;

  const validateSandboxFileOpPath = (path: string | undefined, field: string) => {
    if (!path) throw new Error(`${field} is required`);

    // 路径不再走 shell，不能用字符白名单限制正常文件名；只拦截控制字符和目录穿越。
    if (/[\0\r\n]/.test(path)) {
      throw new Error('Invalid path characters');
    }
    if (path.split('/').includes('..')) {
      throw new Error('Path traversal detected');
    }
  };

  const ensureParentDirectory = async (path: string) => {
    const parentDir = getParentDirectory(path);
    if (parentDir) {
      await sandbox.provider.createDirectories([parentDir]);
    }
  };

  const assertFileDeleteResult = (
    path: string,
    result?: { success: boolean; error?: Error | null }
  ) => {
    if (!result || !result.success || result.error) {
      throw new Error(`Failed to delete file: ${result?.error?.message || path}`);
    }
  };

  const assertFileReadResult = (
    path: string,
    result?: { content: Uint8Array; error?: Error | null }
  ) => {
    if (!result || result.error) {
      throw new Error(`Failed to read file: ${result?.error?.message || path}`);
    }
    return result.content;
  };

  const assertFileWriteResult = (path: string, result?: { error?: Error | null }) => {
    if (!result || result.error) {
      throw new Error(`Failed to write file: ${result?.error?.message || path}`);
    }
  };

  const getPathInfo = async (path: string) => {
    const infoMap = await sandbox.provider.getFileInfo([path]);
    return infoMap.get(path);
  };

  const copySandboxPath = async (sourcePath: string, destinationPath: string, depth = 0) => {
    if (depth > MAX_COPY_DEPTH) {
      throw new Error('Sandbox copy depth exceeded');
    }

    const sourceInfo = await getPathInfo(sourcePath);
    if (sourceInfo?.isDirectory) {
      await sandbox.provider.createDirectories([destinationPath]);
      const entries = await sandbox.provider.listDirectory(sourcePath);

      // adapter 目前没有 copy API，只能用 list/read/write 递归复制目录结构。
      for (const entry of entries) {
        await copySandboxPath(entry.path, joinProviderPath(destinationPath, entry.name), depth + 1);
      }
      return;
    }

    await ensureParentDirectory(destinationPath);
    const [file] = await sandbox.provider.readFiles([sourcePath]);
    const content = assertFileReadResult(sourcePath, file);
    const [writeResult] = await sandbox.provider.writeFiles([
      { path: destinationPath, data: content }
    ]);
    assertFileWriteResult(destinationPath, writeResult);
  };

  validateSandboxFileOpPath(path, 'path');
  if (type === 'move' || type === 'copy') {
    validateSandboxFileOpPath(destPath, 'destPath');
  } else if (destPath !== undefined) {
    validateSandboxFileOpPath(destPath, 'destPath');
  }

  const resolvedPath = resolveSandboxWorkspacePath(path);
  const resolvedDestPath = destPath ? resolveSandboxWorkspacePath(destPath) : undefined;

  switch (type) {
    case 'mkdir':
      await sandbox.provider.createDirectories([resolvedPath]);
      return;

    case 'delete': {
      const pathInfo = await getPathInfo(resolvedPath);
      if (pathInfo?.isDirectory) {
        await sandbox.provider.deleteDirectories([resolvedPath], { recursive: true, force: true });
        return;
      }

      const [result] = await sandbox.provider.deleteFiles([resolvedPath]);
      assertFileDeleteResult(resolvedPath, result);
      return;
    }

    case 'move':
      if (!resolvedDestPath) throw new Error('destPath is required for move');
      await ensureParentDirectory(resolvedDestPath);
      await sandbox.provider.moveFiles([{ source: resolvedPath, destination: resolvedDestPath }]);
      return;

    case 'copy':
      if (!resolvedDestPath) throw new Error('destPath is required for copy');
      await copySandboxPath(resolvedPath, resolvedDestPath);
      return;

    default:
      throw new Error('Unsupported operation type');
  }
};

async function handler(req: ApiRequestProps): Promise<SandboxFileOpResponse> {
  const { appId, chatId, type, path, destPath, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxFileOpBodySchema
  }).body;

  const { uid, teamId } = await authSandboxSession({
    req,
    appId,
    chatId,
    outLinkAuthData,
    per: WritePermissionVal
  });

  const sandbox = await getSandboxClient({ appId, userId: uid, chatId, teamId });
  await sandbox.ensureAvailable();

  await runSandboxFileOperation({ sandbox, type, path, destPath });

  return { success: true };
}

export default NextAPI(handler);
