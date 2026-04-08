import type { NextApiResponse } from 'next';
import mime from 'mime';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getSandboxClient, type SandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import archiver from 'archiver';
import { z } from 'zod';
import { OutLinkChatAuthSchema } from '@fastgpt/global/support/permission/chat';

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

  // 通过 getFileInfo 准确判断路径是文件还是目录
  const fileInfoMap = await sandbox.provider.getFileInfo([path]);
  const fileInfo = fileInfoMap.get(path);
  const isDirectory = fileInfo?.isDirectory ?? (path === '.' || path === '' || path.endsWith('/'));

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

    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(res);
    // 递归添加文件到 ZIP
    await addDirectoryToArchive(sandbox, archive, path, '');

    await archive.finalize();
  } else {
    // 下载单个文件
    const results = await sandbox.provider.readFiles([path]);
    const result = results[0];

    if (result.error) {
      return Promise.reject('Failed to read file');
    }

    const rawFileName = path.split('/').pop() || 'file';
    const fileName = encodeURIComponent(rawFileName);

    if (preview) {
      // 预览逻辑
      const contentType = mime.getType(path) || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
    } else {
      // 下载逻辑
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`
      );
    }

    res.send(Buffer.from(result.content));
  }
}

// 递归添加目录到 archive
async function addDirectoryToArchive(
  sandbox: SandboxClient,
  archive: archiver.Archiver,
  dirPath: string,
  archivePath: string
): Promise<void> {
  const entries = await sandbox.provider.listDirectory(dirPath);

  for (const entry of entries) {
    const entryArchivePath = archivePath ? `${archivePath}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      // 递归处理子目录
      await addDirectoryToArchive(sandbox, archive, entry.path, entryArchivePath);
    } else {
      // 添加文件
      const results = await sandbox.provider.readFiles([entry.path]);
      const result = results[0];

      if (!result.error) {
        archive.append(Buffer.from(result.content), { name: entryArchivePath });
      }
    }
  }
}

export default NextAPI(handler);
