import type { NextApiResponse } from 'next';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getAuthorizedSandboxClient } from '@/service/core/sandbox/runtime';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import archiver from 'archiver';
import { SandboxDownloadBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  addDirectoryToArchive,
  resolveSandboxDownloadTarget
} from '@fastgpt/service/core/ai/sandbox/application/file';

import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

export const writeDirectoryArchiveResponse = async ({
  sandbox,
  archive,
  res,
  path
}: {
  sandbox: SandboxClient;
  archive: archiver.Archiver;
  res: NextApiResponse;
  path: string;
}) => {
  let onArchiveError: ((err: Error) => void) | undefined;
  let archiveError: Error | undefined;
  const archiveErrorPromise = new Promise<never>((_, reject) => {
    onArchiveError = (err: Error) => {
      archiveError = err;
      reject(err);
    };
    archive.once('error', onArchiveError);
  });
  void archiveErrorPromise.catch(() => undefined);

  archive.pipe(res);
  try {
    await addDirectoryToArchive({ sandbox, archive, dirPath: path, archivePath: '' });
    if (archiveError) {
      throw archiveError;
    }
    await Promise.race([Promise.resolve(archive.finalize()), archiveErrorPromise]);
  } catch (error) {
    archive.destroy();
    throw error;
  } finally {
    if (onArchiveError) {
      archive.off('error', onArchiveError);
    }
  }
};

const writeFileStreamResponse = async ({
  sandbox,
  res,
  providerPath,
  fileSize
}: {
  sandbox: SandboxClient;
  res: NextApiResponse;
  providerPath: string;
  fileSize?: number;
}) => {
  const fileName = providerPath.split('/').pop() || 'file';
  const encodedFileName = encodeURIComponent(fileName);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
  );
  if (typeof fileSize === 'number') {
    res.setHeader('Content-Length', String(fileSize));
  }

  await pipeline(Readable.from(sandbox.opensandbox.readFileStream(providerPath)), res);
};

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { customUid, authProxy, sourceType, sourceId, chatId, path, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxDownloadBodySchema
    }).body;

  const { sandbox } = await getAuthorizedSandboxClient({
    customUid,
    authProxy,
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per: ReadPermissionVal
  });

  const { providerPath, isDirectory, size } = await resolveSandboxDownloadTarget(sandbox, path);

  if (isDirectory) {
    const isRoot = path === '.' || path === '';
    const rawFileName = isRoot ? 'workspace' : path.split('/').filter(Boolean).pop() || 'workspace';
    const fileName = encodeURIComponent(`${rawFileName}-${Date.now()}.zip`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`
    );

    await writeDirectoryArchiveResponse({
      sandbox,
      archive: archiver('zip', { zlib: { level: 9 } }),
      res,
      path
    });
  } else {
    await writeFileStreamResponse({ sandbox, res, providerPath, fileSize: size });
  }
}

export default NextAPI(handler);
