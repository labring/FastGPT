/**
 * 沙盒业务层：定义 Skill 版本包的 prepare step。
 *
 * 只服务 sandbox runtime 初始化链路，不负责 Skill 版本创建或权限校验。
 */
import type { SandboxStatusPhase } from '@fastgpt/global/core/chat/type';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import type { SandboxPrepareContext, SandboxPrepareStep } from '../prepare';
import { joinSandboxPath } from '../../../utils';
import { getAgentSandboxSkillMaxBytes } from '../../../config';
import { DEFAULT_GITIGNORE_CONTENT, downloadSkillPackageStream } from '../../../../skill/package';
import { Readable } from 'node:stream';

export type SkillPackagePrepareContext = SandboxPrepareContext & {
  workspaceHasContent?: boolean;
};

/** 将对象存储中的 skill 包流式写入 sandbox，并解压到当前工作目录。 */
export const deploySkillPackage =
  ({
    storageKey,
    skillsRootPath,
    onProgress
  }: {
    storageKey: string;
    skillsRootPath: string;
    onProgress?: (phase: SandboxStatusPhase) => void;
  }): SandboxPrepareStep<SkillPackagePrepareContext> =>
  async (context) => {
    await context.sandbox.createDirectories([skillsRootPath]);

    const zipPath = joinSandboxPath(skillsRootPath, 'package.zip');
    const maxPackageBytes = getAgentSandboxSkillMaxBytes();

    onProgress?.('downloadingPackage');
    const packageStream = await downloadSkillPackageStream({ storageKey });
    onProgress?.('uploadingPackage');
    const writeResults = await context.sandbox
      .writeFiles([
        {
          path: zipPath,
          data: Readable.toWeb(packageStream) as ReadableStream<Uint8Array>
        }
      ])
      .finally(() => {
        if (!packageStream.destroyed) {
          packageStream.destroy();
        }
      });
    const failedWrite = writeResults.find((result) => result.error);
    if (failedWrite) {
      throw new Error(`Failed to write skill package ZIP: ${failedWrite.error?.message}`);
    }

    onProgress?.('extractingPackage');

    const unzipCmd = [
      `unzip -Z -t ${shellQuote(zipPath)} | awk -v max=${maxPackageBytes} 'BEGIN { ok=0 } /uncompressed,/ { ok=(($3 + 0) <= max) } END { exit ok ? 0 : 1 }'`,
      `unzip -Z1 ${shellQuote(zipPath)} | awk 'BEGIN { ok=1 } /^\\// || /(^|\\/)\\.\\.($|\\/)/ { ok=0 } END { exit ok ? 0 : 1 }'`,
      `unzip -o -q ${shellQuote(zipPath)} -d .`
    ].join(' && ');

    const extractResult = await context.sandbox.execute(unzipCmd, {
      workingDirectory: context.workDirectory
    });
    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to decompress package inside sandbox: ${extractResult.stderr}`);
    }

    const [deleteResult] = await context.sandbox.deleteFiles([zipPath]);
    if (!deleteResult?.success || deleteResult.error) {
      throw new Error(
        `Failed to remove extracted skill package ZIP: ${deleteResult?.error?.message ?? 'delete failed'}`
      );
    }

    const gitignorePath = joinSandboxPath(context.workDirectory, '.gitignore');
    const gitignoreInfo = await context.sandbox.getFileInfo([gitignorePath]);
    if (!gitignoreInfo.get(gitignorePath)?.isFile) {
      const [writeGitignoreResult] = await context.sandbox.writeFiles([
        { path: gitignorePath, data: DEFAULT_GITIGNORE_CONTENT }
      ]);
      if (writeGitignoreResult?.error) {
        throw new Error(
          `Failed to write default .gitignore: ${writeGitignoreResult.error.message}`
        );
      }
    }

    return context;
  };
