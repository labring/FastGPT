import type { SandboxStatusPhase } from '@fastgpt/global/core/chat/type';
import type { SandboxPrepareContext, SandboxPrepareStep } from '../../sandbox/runtime/prepare';
import { joinSandboxPath, shellQuote } from '../../sandbox/runtime/utils';
import { serviceEnv } from '../../../../env';
import { DEFAULT_GITIGNORE_CONTENT, downloadSkillPackage } from '../package';

export type SkillPackagePrepareContext = SandboxPrepareContext & {
  packageBuffer?: Buffer;
  workspaceHasContent?: boolean;
};

export type SkillPackagePrepareStep = SandboxPrepareStep<SkillPackagePrepareContext>;

/** 下载指定 skill 版本包，并挂到 prepare context，供后续部署 step 使用。 */
export const downloadSkillPackageToContext =
  ({
    storageKey,
    onProgress
  }: {
    storageKey: string;
    onProgress?: (phase: SandboxStatusPhase) => void;
  }): SkillPackagePrepareStep =>
  async (context) => {
    onProgress?.('downloadingPackage');
    return {
      ...context,
      packageBuffer: await downloadSkillPackage({ storageKey })
    };
  };

/** 在 prepare 链路中显式上报 skill 部署阶段，保持调用处生命周期可读。 */
export const reportSkillPrepareProgress =
  ({
    phase,
    onProgress
  }: {
    phase: SandboxStatusPhase;
    onProgress?: (phase: SandboxStatusPhase) => void;
  }): SkillPackagePrepareStep =>
  async (context) => {
    onProgress?.(phase);
    return context;
  };

/** 将已下载的 skill ZIP 写入 sandbox 并解压到当前工作目录。 */
export const deployDownloadedSkillPackage =
  ({
    skillsRootPath,
    onProgress
  }: {
    skillsRootPath: string;
    onProgress?: (phase: SandboxStatusPhase) => void;
  }): SkillPackagePrepareStep =>
  async (context) => {
    if (!context.packageBuffer) {
      throw new Error('Skill package buffer is required before deployment');
    }

    onProgress?.('uploadingPackage');
    const prepareSkillsRootResult = await context.sandbox.execute(
      `mkdir -p ${shellQuote(skillsRootPath)}`
    );
    if (prepareSkillsRootResult.exitCode !== 0) {
      throw new Error(`Failed to prepare skill directory: ${prepareSkillsRootResult.stderr}`);
    }

    const zipPath = joinSandboxPath(skillsRootPath, 'package.zip');
    const maxPackageBytes = serviceEnv.AGENT_SANDBOX_SKILL_MAX_SIZE * 1024 * 1024;

    const writeResults = await context.sandbox.writeFiles([
      {
        path: zipPath,
        data: context.packageBuffer
      }
    ]);
    const failedWrite = writeResults.find((result) => result.error);
    if (failedWrite) {
      throw new Error(`Failed to write skill package ZIP: ${failedWrite.error?.message}`);
    }

    onProgress?.('extractingPackage');

    const unzipCmd = [
      `cd ${shellQuote(context.workDirectory)}`,
      `unzip -Z -t ${shellQuote(zipPath)} | awk -v max=${maxPackageBytes} 'BEGIN { ok=0 } /uncompressed,/ { ok=(($3 + 0) <= max) } END { exit ok ? 0 : 1 }'`,
      `unzip -Z1 ${shellQuote(zipPath)} | awk 'BEGIN { ok=1 } /^\\// || /(^|\\/)\\.\\.($|\\/)/ { ok=0 } END { exit ok ? 0 : 1 }'`,
      `unzip -o -q ${shellQuote(zipPath)} -d .`,
      `rm -f ${shellQuote(zipPath)}`,
      `if [ ! -f .gitignore ]; then echo ${shellQuote(DEFAULT_GITIGNORE_CONTENT)} > .gitignore; fi`
    ].join(' && ');

    const extractResult = await context.sandbox.execute(unzipCmd);
    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to decompress package inside sandbox: ${extractResult.stderr}`);
    }

    return context;
  };
