import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { pickOutboundAxios } from '../../../../common/api/axios';

export type SandboxUrlFile = {
  path: string;
  url: string;
};

/**
 * 将远程 URL 文件写入已存在的 sandbox 实例。
 *
 * 这里不负责 sandbox 生命周期，只统一处理下载和 writeFiles。
 */
export async function writeUrlFilesToSandbox(sandbox: ISandbox, files: SandboxUrlFile[]) {
  const writeFileTasks: Promise<FileWriteEntry>[] = [];

  for (const { path, url } of files) {
    if (!path) continue;
    writeFileTasks.push(
      pickOutboundAxios(url)
        .get<ArrayBuffer>(url, {
          responseType: 'arraybuffer'
        })
        .then((response) => ({
          path,
          data: response.data
        }))
    );
  }

  if (writeFileTasks.length === 0) return;
  await sandbox.writeFiles(await Promise.all(writeFileTasks));
}
