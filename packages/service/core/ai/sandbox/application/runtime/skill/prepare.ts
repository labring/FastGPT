/**
 * 沙盒业务层：定义 Skill 版本包的 prepare step。
 *
 * 只服务 sandbox runtime 初始化链路，不负责 Skill 版本创建或权限校验。
 */
import type { SandboxStatusPhase } from '@fastgpt/global/core/chat/type';
import type { SandboxPrepareContext, SandboxPrepareStep } from '../prepare';
import { joinSandboxPath } from '../../../utils';
import { DEFAULT_GITIGNORE_CONTENT } from '../../../../skill/package/constants';
import { openSkillPackageTarZstStream } from '../../../../skill/package/storage';
import { extractToSandboxDirectory } from '../../ideAgent';

/** 从对象存储流式读取 Skill 包（`.tar.zst` 直传、`.zip` 走 HTTP Range 实时转码）并解压至当前工作目录。 */
export const deploySkillPackage =
  ({
    storageKey,
    skillsRootPath,
    onProgress
  }: {
    storageKey: string;
    skillsRootPath: string;
    onProgress?: (phase: SandboxStatusPhase) => void;
  }): SandboxPrepareStep<SandboxPrepareContext> =>
  async (context) => {
    await context.sandbox.createDirectories([skillsRootPath]);

    onProgress?.('downloadingPackage');
    await extractToSandboxDirectory({
      sandbox: context.sandbox,
      targetDirectory: context.workDirectory,
      signal: context.lease?.signal,
      openBody: async () => {
        const body = await openSkillPackageTarZstStream({ storageKey });
        onProgress?.('extractingPackage');
        return body;
      }
    });

    const gitignorePath = joinSandboxPath(context.workDirectory, '.gitignore');
    const gitignoreInfo = await context.sandbox.getFileInfo([gitignorePath]);
    if (!gitignoreInfo.get(gitignorePath)?.isFile) {
      const [writeGitignoreResult] = await context.sandbox.writeFiles([
        { path: gitignorePath, data: DEFAULT_GITIGNORE_CONTENT }
      ]);
      if (writeGitignoreResult?.error) {
        throw new Error(
          `Failed to write default .gitignore: ${writeGitignoreResult.error.message}`,
          { cause: writeGitignoreResult.error }
        );
      }
    }

    return context;
  };
