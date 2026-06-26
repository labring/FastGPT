import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import {
  injectInputFilesToSandbox,
  readSandboxPwd,
  type SandboxCommandClient,
  type SandboxInputFile
} from './files';
import { prepareSandboxRuntimeMirrors } from './mirrors';
import { shellQuote } from './utils';

export type SandboxPrepareContext = {
  sandbox: ISandbox;
  sandboxClient?: SandboxCommandClient;
  workDirectory: string;
  currentWorkingDirectory?: string;
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

/** 在 sandbox 内写入 npm/pnpm/yarn/bun/pip/uv 镜像源配置。 */
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
    const result = await context.sandbox.execute(`mkdir -p ${shellQuote(context.workDirectory)}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to prepare workspace directory: ${result.stderr}`);
    }

    return context;
  };

/** 检查工作目录是否已有内容，用于 edit-debug 复用旧 sandbox 时判断是否需要重新部署包。 */
export const inspectWorkDirectoryContent =
  <
    Context extends SandboxPrepareContext & { workspaceHasContent?: boolean }
  >(): SandboxPrepareStep<Context> =>
  async (context) => {
    const quotedWorkDirectory = shellQuote(context.workDirectory);
    const result = await context.sandbox.execute(
      `mkdir -p ${quotedWorkDirectory} && test -n "$(find ${quotedWorkDirectory} -mindepth 1 -print -quit 2>/dev/null)"`
    );

    if (result.exitCode === 0) {
      return {
        ...context,
        workspaceHasContent: true
      };
    }
    if (result.exitCode === 1) {
      return {
        ...context,
        workspaceHasContent: false
      };
    }

    throw new Error(`Failed to inspect workspace content: ${result.stderr || result.stdout}`);
  };

/** 清空工作目录内容但保留目录本身，避免 volume 根目录权限和挂载点问题。 */
export const emptyWorkDirectory =
  <Context extends SandboxPrepareContext>(): SandboxPrepareStep<Context> =>
  async (context) => {
    // 已有实例重部署时先清空工作区；保留挂载点本身，避免 volume 根目录权限问题。
    const cleanCmd = `find ${shellQuote(context.workDirectory)} -mindepth 1 -delete || (rm -rf ${shellQuote(context.workDirectory)}/* && rm -rf ${shellQuote(context.workDirectory)}/.[!.]*)`;

    const result = await context.sandbox.execute(cleanCmd);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to clean workspace processes and files: ${result.stderr}`);
    }

    return context;
  };

/** 将本轮用户输入文件写入 sandbox 的 user_files 目录。 */
export const injectCurrentInputFiles =
  <Context extends SandboxPrepareContext>(
    currentFiles: SandboxInputFile[]
  ): SandboxPrepareStep<Context> =>
  async (context) => {
    await injectInputFilesToSandbox(context.sandbox, currentFiles);
    return context;
  };

/** 读取 sandbox 当前目录，失败时返回 undefined，由上层决定是否展示提示。 */
export const readCurrentWorkingDirectory =
  <
    Context extends SandboxPrepareContext & { sandboxClient: SandboxCommandClient }
  >(): SandboxPrepareStep<Context> =>
  async (context) => ({
    ...context,
    currentWorkingDirectory: await readSandboxPwd(context.sandboxClient)
  });
