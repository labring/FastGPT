import type { NextApiResponse } from 'next';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { SandboxDownloadBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { UserError } from '@fastgpt/global/common/error/utils';
import { jsonRes } from '@fastgpt/service/common/response';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  isSandboxPathDirectory,
  readSandboxSessionDirectoryArchive,
  readSandboxSessionFile,
  SandboxFileNotFoundError
} from '@fastgpt/service/core/ai/sandbox/application/file';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

/**
 * 下载沙盒会话工作目录内的单个文件或目录：
 * - 目录：在容器内打包为 `.zip` 后流式返回；
 * - 单文件：直接返回原始字节流，并携带弱 `ETag` 供前端编辑器乐观锁并发校验使用。
 */
async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return jsonRes(res, { code: 405, message: 'Method Not Allowed' });
  }

  const writeDirectoryArchiveResponse = async ({
    sandbox,
    path
  }: {
    sandbox: SandboxClient;
    path: string;
  }) => {
    const { stream, size, cleanup } = await readSandboxSessionDirectoryArchive(sandbox, path);
    const isRoot = path === '.' || path === '';
    const rawFileName = isRoot ? 'workspace' : path.split('/').filter(Boolean).pop() || 'workspace';
    const fileName = encodeURIComponent(`${rawFileName}-${Date.now()}.zip`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`
    );
    if (typeof size === 'number') res.setHeader('Content-Length', String(size));

    try {
      await pipeline(Readable.from(stream), res);
    } finally {
      await cleanup();
    }
  };

  const writeFileStreamResponse = async ({
    sandbox,
    path
  }: {
    sandbox: SandboxClient;
    path: string;
  }) => {
    const { stream, fileName, etag, size } = await readSandboxSessionFile(sandbox, path);
    const encodedFileName = encodeURIComponent(fileName);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
    );
    res.setHeader('Cache-Control', 'no-store');
    if (etag) res.setHeader('ETag', etag);
    if (typeof size === 'number') res.setHeader('Content-Length', String(size));

    await pipeline(Readable.from(stream), res);
  };

  const { customUid, authProxy, sourceType, sourceId, chatId, path, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxDownloadBodySchema
    }).body;

  await withAuthorizedSandboxClient(
    {
      customUid,
      authProxy,
      req,
      sourceType,
      sourceId,
      chatId,
      outLinkAuthData,
      per: ReadPermissionVal,
      canRetry: () => !res.headersSent
    },
    async ({ sandbox }) => {
      try {
        const isDirectory = await isSandboxPathDirectory(sandbox, path);
        if (isDirectory) {
          await writeDirectoryArchiveResponse({ sandbox, path });
        } else {
          await writeFileStreamResponse({ sandbox, path });
        }
      } catch (error) {
        if (error instanceof SandboxFileNotFoundError && !res.headersSent) {
          return jsonRes(res, { code: 404, error: new UserError(error.message) });
        }
        throw error;
      }
    }
  );
}

export default NextAPI(handler);
