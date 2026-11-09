/**
 * 沙盒业务层：处理运行态输入文件注入。
 *
 * 只封装运行态文件写入辅助，不负责 workspace 打包或编辑器文件下载。
 */
import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  getSandboxInputFileNameAllocation,
  getSafeSandboxInputFilename,
  joinSandboxPath,
  type SandboxInputFileNameAllocation
} from '../../utils';
import {
  prepareSandboxFileParentDirectories,
  readSandboxUrlFile,
  type SandboxInputFileReader
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
export const injectInputFilesToSandbox = async (
  sandbox: ISandbox,
  files: SandboxInputFile[],
  workDirectory = '',
  readInputFile: SandboxInputFileReader = readSandboxUrlFile,
  allocation?: SandboxInputFileNameAllocation
) => {
  const writeFileTasks: Promise<FileWriteEntry>[] = [];
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
    writeFileTasks.push(
      readInputFile(file.url).then((data) => ({
        path,
        data
      }))
    );
  }

  if (writeFileTasks.length === 0) return;
  const writeEntries = await Promise.all(writeFileTasks);
  await prepareSandboxFileParentDirectories(
    sandbox,
    writeEntries.map(({ path }) => path)
  );
  const writeResults = await sandbox.writeFiles(writeEntries);
  const failedWrite = writeResults.find((result) => result.error);
  if (failedWrite) {
    throw new Error(
      `Failed to write sandbox input file ${failedWrite.path}: ${failedWrite.error?.message}`
    );
  }
};
