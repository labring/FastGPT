/**
 * 沙盒业务层：定义 Skill 版本包的 prepare step。
 *
 * 只服务 sandbox runtime 初始化链路，不负责 Skill 版本创建或权限校验。
 */
import type { SandboxStatusPhase } from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { SandboxPrepareContext, SandboxPrepareStep } from '../prepare';
import { joinSandboxPath } from '../../../utils';
import { getAgentSandboxSkillMaxBytes } from '../../../config';
import { DEFAULT_GITIGNORE_CONTENT, downloadSkillPackageStream } from '../../../../skill/package';
import { Readable } from 'node:stream';
import { buildSafeSkillUnzipShellCommand } from './core';

export type SkillPackagePrepareContext = SandboxPrepareContext;

/**
 * 将对象存储中的 skill 包流式写入容器临时目录 `/tmp`，并解压到当前工作目录。
 * 不在持久化 `/workspace` 下创建临时目录，避免污染用户编辑文件树或产生多余 JuiceFS 写入。
 */
export const deploySkillPackage =
  ({
    storageKey,
    onProgress
  }: {
    storageKey: string;
    onProgress?: (phase: SandboxStatusPhase) => void;
  }): SandboxPrepareStep<SkillPackagePrepareContext> =>
  async (context) => {
    const zipPath = `/tmp/.fastgpt-skill-package-${getNanoid(12)}.zip`;
    const maxPackageBytes = getAgentSandboxSkillMaxBytes();

    onProgress?.('downloadingPackage');
    const packageStream = await downloadSkillPackageStream({ storageKey });
    onProgress?.('uploadingPackage');
    try {
      await context.sandbox
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
    } catch (error) {
      await context.sandbox.deleteFiles([zipPath]).catch(() => {});
      throw error;
    }

    onProgress?.('extractingPackage');

    const unzipCmd = buildSafeSkillUnzipShellCommand({
      zipPath,
      destinationDir: '.',
      maxPackageBytes
    });

    const extractResult = await context.sandbox.execute(unzipCmd, {
      workingDirectory: context.workDirectory
    });
    if (extractResult.exitCode !== 0) {
      await context.sandbox.deleteFiles([zipPath]).catch(() => {});
      throw new Error(`Failed to decompress package inside sandbox: ${extractResult.stderr}`);
    }

    await context.sandbox.deleteFiles([zipPath]);

    const gitignorePath = joinSandboxPath(context.workDirectory, '.gitignore');
    const gitignoreInfo = await context.sandbox.getFileInfo([gitignorePath]);
    if (gitignoreInfo.get(gitignorePath)?.type !== 'file') {
      await context.sandbox.writeFiles([{ path: gitignorePath, data: DEFAULT_GITIGNORE_CONTENT }]);
    }

    return context;
  };
