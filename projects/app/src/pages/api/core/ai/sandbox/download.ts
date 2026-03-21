import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { SandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import archiver from 'archiver';
import { z } from 'zod';
import { OutLinkChatAuthSchema } from '@fastgpt/global/support/permission/chat';

const DownloadBodySchema = z.object({
  appId: z.string(),
  chatId: z.string(),
  path: z.string().default('.').describe('要下载的路径(文件或目录)'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const body = DownloadBodySchema.parse(req.body);
  const { appId, chatId, path, outLinkAuthData } = body;

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
  const sandbox = new SandboxClient({
    appId,
    userId: uid,
    chatId
  });

  await sandbox.ensureAvailable();

  // 通过 getFileInfo 准确判断路径是文件还是目录
  const fileInfoMap = await sandbox.provider.getFileInfo([path]);
  const fileInfo = fileInfoMap.get(path);
  const isDirectory = fileInfo?.isDirectory ?? path.endsWith('/');

  if (isDirectory) {
    // 下载目录为 ZIP
    const fileName = path.split('/').filter(Boolean).pop() || 'workspace';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}-${Date.now()}.zip"`);

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

    const fileName = path.split('/').pop() || 'file';
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
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
