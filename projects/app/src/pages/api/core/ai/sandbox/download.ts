import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import archiver from 'archiver';
import { SandboxDownloadBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  isSandboxPathDirectory,
  getSandboxFileContent,
  addDirectoryToArchive
} from '@/service/core/sandbox/fileService';

import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';

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

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { appId, chatId, path, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxDownloadBodySchema
  }).body;

  const { uid, teamId } = await authSandboxSession({
    req,
    appId,
    chatId,
    outLinkAuthData,
    per: ReadPermissionVal
  });

  const sandbox = await getSandboxClient({ appId, userId: uid, chatId, teamId });
  await sandbox.ensureAvailable();

  const isDirectory = await isSandboxPathDirectory(sandbox, path);

  if (isDirectory) {
    const isRoot = path === '.' || path === '' || path === '/';
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
    const { content, fileName } = await getSandboxFileContent(sandbox, path, false);
    const encodedFileName = encodeURIComponent(fileName);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
    );
    res.send(content);
  }
}

export default NextAPI(handler);
