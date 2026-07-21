import type { NextApiResponse } from 'next';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import {
  authSandboxSession,
  buildSandboxClientQueryFromChatSource
} from '@/service/core/sandbox/auth';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import archiver from 'archiver';
import { SandboxDownloadBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  isSandboxPathDirectory,
  addDirectoryToArchive
} from '@fastgpt/service/core/ai/sandbox/interface/file';

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
    await addDirectoryToArchive(sandbox, archive, path, '');
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
  path
}: {
  sandbox: SandboxClient;
  res: NextApiResponse;
  path: string;
}) => {
  const providerPath = sandbox.resolveRuntimePath(path, { allowAbsolutePath: true });
  const fileInfoMap = await sandbox.provider.getFileInfo([providerPath]).catch(() => undefined);
  const fileInfo = fileInfoMap?.get(providerPath);

  if (fileInfo?.isDirectory) {
    return Promise.reject('Cannot read a directory as a file');
  }

  const fileName = providerPath.split('/').pop() || 'file';
  const encodedFileName = encodeURIComponent(fileName);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
  );
  if (typeof fileInfo?.size === 'number') {
    res.setHeader('Content-Length', String(fileInfo.size));
  }

  await pipeline(Readable.from(sandbox.provider.readFileStream(providerPath)), res);
};

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { sourceType, sourceId, chatId, path, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxDownloadBodySchema
  }).body;

  const {
    uid,
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId
  } = await authSandboxSession({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per: ReadPermissionVal
  });

  const sandbox = await getSandboxClient(
    buildSandboxClientQueryFromChatSource({
      sourceType: resolvedSourceType,
      sourceId: resolvedSourceId,
      userId: uid,
      chatId
    })
  );

  const isDirectory = await isSandboxPathDirectory(sandbox, path);

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
    await writeFileStreamResponse({ sandbox, res, path });
  }
}

export default NextAPI(handler);
