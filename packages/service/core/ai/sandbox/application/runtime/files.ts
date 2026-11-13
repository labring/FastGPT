/**
 * 沙盒业务层：处理运行态输入文件注入。
 *
 * 只封装运行态文件写入辅助，不负责 workspace 打包或编辑器文件下载。
 */
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  getSandboxInputFileNameAllocation,
  getSafeSandboxInputFilename,
  joinSandboxPath,
  type SandboxInputFileNameAllocation
} from '../../utils';
import {
  readSandboxUrlFile,
  writeUrlFilesToSandbox,
  type SandboxInputFileReader,
  type SandboxUrlFile
} from '../file';

export type SandboxInputFile = {
  name: string;
  url: string;
  sandboxPath?: string;
};

/**
 * 将本轮用户输入文件写入当前 sandbox。
 *
 * 路径规则和通用 toolcall 保持一致：用户文件直接写入 user_files/<文件名>。
 * 同一会话沙盒内跨子应用/节点传入同名但不同 URL 的文件时，按会话级分配表自动递增文件名并回写 sandboxPath，避免覆盖前序文件。
 */
export const injectInputFilesToSandbox = async ({
  sandbox,
  files,
  workDirectory = '',
  readInputFile = readSandboxUrlFile,
  allocation
}: {
  sandbox: OpenSandboxClient;
  files: SandboxInputFile[];
  workDirectory?: string;
  readInputFile?: SandboxInputFileReader;
  allocation?: SandboxInputFileNameAllocation;
}) => {
  const urlFiles: SandboxUrlFile[] = [];
  const usedNames = new Map<string, number>();
  const batchUsedFilenames = new Set<string>();
  const effectiveAllocation =
    allocation ?? getSandboxInputFileNameAllocation({ sandbox, workDirectory });

  for (const [index, file] of files.entries()) {
    const filename = getSafeSandboxInputFilename(file.name, index, usedNames, {
      url: file.url,
      allocation: effectiveAllocation,
      batchUsedFilenames
    });
    const relativePath = `${SANDBOX_USER_FILES_PATH}${filename}`;
    file.name = filename;
    file.sandboxPath = relativePath;
    const path = workDirectory ? joinSandboxPath(workDirectory, relativePath) : relativePath;
    urlFiles.push({ path, url: file.url });
  }

  await writeUrlFilesToSandbox({
    sandbox,
    files: urlFiles,
    readInputFile
  });
};
