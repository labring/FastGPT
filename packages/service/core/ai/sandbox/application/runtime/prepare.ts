/**
 * 沙盒业务层：定义运行态 sandbox 初始化步骤编排器。
 *
 * 只组合工作目录、输入文件、镜像源等 prepare step，不直接操作 Mongo 或 provider 配置。
 */
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import {
  injectInputFilesToSandbox,
  type SandboxInputFile,
  type SandboxInputFileReader
} from './files';
import { prepareSandboxRuntimeMirrors } from './mirrors';

export type SandboxPrepareContext = {
  sandbox: ISandbox;
  workDirectory: string;
  workspaceRoot?: string;
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

/** 检查工作目录是否已有内容，用于 edit-debug 复用旧 sandbox 时判断是否需要重新部署包。 */
export const inspectWorkDirectoryContent =
  <
    Context extends SandboxPrepareContext & { workspaceHasContent?: boolean }
  >(): SandboxPrepareStep<Context> =>
  async (context) => {
    await context.sandbox.createDirectories([context.workDirectory]);
    const entries = await context.sandbox.listDirectory(context.workDirectory);

    return {
      ...context,
      workspaceHasContent: entries.length > 0
    };
  };

/** 清空工作目录内容但保留目录本身，避免 volume 根目录权限和挂载点问题。 */
export const emptyWorkDirectory =
  <Context extends SandboxPrepareContext>(): SandboxPrepareStep<Context> =>
  async (context) => {
    const entries = await context.sandbox.listDirectory(context.workDirectory);
    const filePaths = entries.filter((entry) => !entry.isDirectory).map((entry) => entry.path);
    const directoryPaths = entries.filter((entry) => entry.isDirectory).map((entry) => entry.path);

    if (filePaths.length > 0) {
      const deleteResults = await context.sandbox.deleteFiles(filePaths);
      const failedDelete = deleteResults.find((result) => result.error || !result.success);
      if (failedDelete) {
        throw new Error(
          `Failed to clean workspace file ${failedDelete.path}: ${failedDelete.error?.message ?? 'delete failed'}`
        );
      }
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
    await injectInputFilesToSandbox(
      context.sandbox,
      currentFiles,
      context.workDirectory,
      readInputFile
    );
    return context;
  };
