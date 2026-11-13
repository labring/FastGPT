/**
 * 沙盒业务层：定义运行态 sandbox 初始化步骤编排器。
 *
 * 只组合工作目录、输入文件、镜像源等 prepare step，不直接操作 Mongo 或 OpenSandbox 配置。
 */
import { posix } from 'node:path';
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import { injectInputFilesToSandbox, type SandboxInputFile } from './files';
import { type SandboxInputFileReader } from '../file';
import { prepareSandboxRuntimeMirrors } from './mirrors';
import type { SandboxInputFileNameAllocation } from '../../utils';

export type SandboxPrepareContext = {
  sandbox: OpenSandboxClient;
  workDirectory: string;
  workspaceRoot?: string;
  inputFileAllocation?: SandboxInputFileNameAllocation;
};

export type SandboxPrepareStep<Context extends SandboxPrepareContext> = (
  context: Context
) => Promise<Context>;

/** 顺序执行 sandbox prepare steps，每个 step 都返回下一步可继续消费的上下文。 */
export const prepareSandbox = async <Context extends SandboxPrepareContext>(
  context: Context,
  ...steps: SandboxPrepareStep<Context>[]
): Promise<Context> => {
  let currentContext = context;
  for (const step of steps) {
    currentContext = await step(currentContext);
  }
  return currentContext;
};

/** 在 sandbox 内写入 npm/pnpm/yarn/bun/pip/uv/apt 镜像源配置。 */
export const preparePackageMirrors =
  <Context extends SandboxPrepareContext>(): SandboxPrepareStep<Context> =>
  async (context) => {
    await prepareSandboxRuntimeMirrors({ sandbox: context.sandbox });
    return context;
  };

/** 确保当前 runtime 工作目录存在，供后续文件注入、entrypoint 和 skill 扫描使用。 */
export const prepareWorkDirectory =
  <Context extends SandboxPrepareContext>(): SandboxPrepareStep<Context> =>
  async (context) => {
    await context.sandbox.createDirectories([context.workDirectory]);

    return context;
  };

/** 清空工作目录内容但保留目录本身与内部 `.fastgpt` 运行态/依赖目录，避免挂载点与依赖前缀丢失。 */
export const emptyWorkDirectory =
  <Context extends SandboxPrepareContext>(): SandboxPrepareStep<Context> =>
  async (context) => {
    const entries = (await context.sandbox.listDirectory(context.workDirectory)).filter((entry) => {
      const name = posix.basename(entry.path);
      return name !== '.' && name !== '..' && name !== '.fastgpt';
    });
    const filePaths = entries
      .filter((entry) => entry.type !== 'directory')
      .map((entry) => entry.path);
    const directoryPaths = entries
      .filter((entry) => entry.type === 'directory')
      .map((entry) => entry.path);

    if (filePaths.length > 0) {
      await context.sandbox.deleteFiles(filePaths);
    }
    if (directoryPaths.length > 0) {
      await context.sandbox.deleteDirectories(directoryPaths);
    }

    return context;
  };

/** 将本轮用户输入文件写入 sandbox 的 user_files 目录。 */
export const injectCurrentInputFiles =
  <Context extends SandboxPrepareContext>(
    currentFiles: SandboxInputFile[],
    readInputFile?: SandboxInputFileReader
  ): SandboxPrepareStep<Context> =>
  async (context) => {
    await injectInputFilesToSandbox({
      sandbox: context.sandbox,
      files: currentFiles,
      workDirectory: context.workDirectory,
      readInputFile,
      allocation: context.inputFileAllocation
    });
    return context;
  };
