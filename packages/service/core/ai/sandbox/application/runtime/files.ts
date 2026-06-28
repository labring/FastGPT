/**
 * 沙盒业务层：处理运行态输入文件注入和当前目录提示。
 *
 * 只封装运行态文件写入辅助，不负责 workspace 打包或编辑器文件下载。
 */
import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { pickOutboundAxios } from '../../../../../common/api/axios';
import { getSafeSandboxInputFilename } from '../../utils';

export type SandboxInputFile = {
  name: string;
  url: string;
};

export type SandboxCommandClient = {
  exec: (command: string) => Promise<{
    exitCode: number | null;
    stdout: string;
  }>;
};

/**
 * 读取 sandbox 当前目录，仅作为 user reminder 的提示增强。
 * 如果命令失败或没有输出，返回 undefined，让提示词侧完全跳过 pwd 区块。
 */
export const readSandboxPwd = async (sandboxClient: SandboxCommandClient) => {
  try {
    const result = await sandboxClient.exec('pwd');
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {
    return;
  }
};

/**
 * 将本轮用户输入文件写入当前 sandbox。
 *
 * 路径规则和通用 toolcall 保持一致：用户文件直接写入 user_files/<文件名>。
 * 这里直接消费 currentFiles，避免先构造中间 sandbox file 结构再二次遍历。
 */
export const injectInputFilesToSandbox = async (sandbox: ISandbox, files: SandboxInputFile[]) => {
  const writeFileTasks: Promise<FileWriteEntry>[] = [];
  const usedNames = new Map<string, number>();

  for (const [index, file] of files.entries()) {
    const filename = getSafeSandboxInputFilename(file.name, index, usedNames);
    const path = `${SANDBOX_USER_FILES_PATH}${filename}`;
    writeFileTasks.push(
      pickOutboundAxios(file.url)
        .get<ArrayBuffer>(file.url, {
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
};
