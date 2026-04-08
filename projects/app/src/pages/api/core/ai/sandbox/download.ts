import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import archiver from 'archiver';
import { z } from 'zod';
import { OutLinkChatAuthSchema } from '@fastgpt/global/support/permission/chat';
import {
  isSandboxPathDirectory,
  getSandboxFileContent,
  addDirectoryToArchive
} from '@/service/core/sandbox/fileService';

const DownloadBodySchema = z.object({
  appId: z.string(),
  chatId: z.string(),
  path: z.string().default('.').describe('要下载的路径(文件或目录)'),
  preview: z.boolean().optional().describe('是否直接预览(不强制下载)'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const body = DownloadBodySchema.parse(req.body);
  const { appId, chatId, path, preview, outLinkAuthData } = body;

  // 鉴权
  const { uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  // 创建沙盒实例
  const sandbox = await getSandboxClient({
    appId,
    userId: uid,
    chatId
  });

  await sandbox.ensureAvailable();

  const isDirectory = await isSandboxPathDirectory(sandbox, path);

  if (isDirectory) {
    // 下载目录为 ZIP
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
    // 下载/预览单个文件
    const { content, contentType, fileName } = await getSandboxFileContent(sandbox, path, preview);
    const encodedFileName = encodeURIComponent(fileName);

    res.setHeader('Content-Type', contentType);
    if (!preview) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
      );
    }

    res.send(content);
  }
}

export default NextAPI(handler);
