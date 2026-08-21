/**
 * 沙盒业务层：处理运行态输入文件注入。
 *
 * 只封装运行态文件写入辅助，不负责 workspace 打包或编辑器文件下载。
 */
import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { getSafeSandboxInputFilename, joinSandboxPath } from '../../utils';
import {
  prepareSandboxFileParentDirectories,
  readSandboxUrlFile,
  type SandboxInputFileReader
} from '../file';

export type { SandboxInputFileReader } from '../file';

export type SandboxInputFile = {
  name: string;
  url: string;
};

/**
 * 将本轮用户输入文件写入当前 sandbox。
 *
 * 路径规则和通用 toolcall 保持一致：用户文件直接写入 user_files/<文件名>。
 * 这里直接消费 currentFiles，避免先构造中间 sandbox file 结构再二次遍历。
 */
export const injectInputFilesToSandbox = async (
  sandbox: ISandbox,
  files: SandboxInputFile[],
  workDirectory = '',
  readInputFile: SandboxInputFileReader = readSandboxUrlFile
) => {
  const writeFileTasks: Promise<FileWriteEntry>[] = [];
  const usedNames = new Map<string, number>();

  for (const [index, file] of files.entries()) {
    const filename = getSafeSandboxInputFilename(file.name, index, usedNames);
    const relativePath = `${SANDBOX_USER_FILES_PATH}${filename}`;
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
