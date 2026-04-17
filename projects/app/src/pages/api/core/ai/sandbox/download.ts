import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import archiver from 'archiver';
import { SandboxDownloadBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import {
  isSandboxPathDirectory,
  getSandboxFileContent,
  addDirectoryToArchive
} from '@/service/core/sandbox/fileService';

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { appId, chatId, path, outLinkAuthData } = SandboxDownloadBodySchema.parse(req.body);

  const { uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  const sandbox = await getSandboxClient({ appId, userId: uid, chatId });
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

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);
    await addDirectoryToArchive(sandbox, archive, path, '');
    await archive.finalize();
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
