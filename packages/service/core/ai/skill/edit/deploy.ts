import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../../../common/logger';
import { updateCurrentStorage } from '../manage';
import {
  extractSkillMdInfosFromBuffer,
  normalizeSkillPackageZipForSandbox,
  uploadSkillPackage
} from '../package';
import { packageSkillInSandbox } from './sandbox';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from './config';
import { createVersion, getNextVersionNumber, setActiveVersion } from '../version';
import { extractSkillFromMarkdown } from '../utils/skillMarkdown';
import { getSkillsRootPath } from '../runtime';
import { findSandboxInstanceByAppChatType } from '../../sandbox/instance';
import { getSandboxDefaults, getSandboxProviderConfig } from '../../sandbox/config';
import { MongoAgentSkills } from '../model/schema';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { SaveDeploySkillResponse } from '@fastgpt/global/core/ai/skill/api';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.DEPLOY);

export type SaveDeploySkillFromSandboxParams = {
  skillId: string;
  teamId: string;
  tmbId: string;
  versionName?: string;
};

/**
 * 从 edit-debug sandbox 打包当前编辑内容，并发布为新的 active version。
 *
 * API 层负责鉴权和创建状态校验；这里聚焦保存发布的业务动作：定位 edit sandbox、
 * 打包 sandbox 工作目录下的 skills、校验每个 SKILL.md、上传对象存储、
 * 创建版本并切为当前版本。
 */
export async function saveDeploySkillFromSandbox({
  skillId,
  teamId,
  tmbId,
  versionName
}: SaveDeploySkillFromSandboxParams): Promise<SaveDeploySkillResponse> {
  const providerConfig = getSandboxProviderConfig();
  const sandboxInfo = await findSandboxInstanceByAppChatType({
    provider: providerConfig.provider,
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    status: SandboxStatusEnum.running,
    type: SandboxTypeEnum.editDebug
  });

  if (!sandboxInfo || sandboxInfo.status !== SandboxStatusEnum.running) {
    return Promise.reject(new UserError('Edit sandbox not found or not running'));
  }

  let packageBuffer: Buffer;
  try {
    const defaults = getSandboxDefaults();
    const defaultSkillsRootPath = getSkillsRootPath(defaults.workDirectory);
    const metadataEditDir =
      typeof sandboxInfo.metadata?.editSkillDir === 'string'
        ? sandboxInfo.metadata.editSkillDir
        : '';
    const normalizedMetadataEditDir = metadataEditDir.replace(/\/+$/, '');
    const skillsRootPath = normalizedMetadataEditDir.endsWith('/skills')
      ? normalizedMetadataEditDir
      : defaultSkillsRootPath;
    packageBuffer = await packageSkillInSandbox({
      sandboxId: sandboxInfo.sandboxId,
      workDirectory: skillsRootPath
    });
    packageBuffer = await normalizeSkillPackageZipForSandbox(packageBuffer);
  } catch (error: any) {
    return Promise.reject(
      new UserError(`Failed to package skill directory: ${error.message || 'Unknown error'}`)
    );
  }

  const skillMdInfos = await extractSkillMdInfosFromBuffer(packageBuffer);
  if (skillMdInfos.length === 0) {
    logger.warn('SKILL.md not found in skill package');
    return Promise.reject(SkillErrEnum.invalidSkillPackage);
  }

  for (const info of skillMdInfos) {
    const { skill: parsedSkill, error: parseError } = extractSkillFromMarkdown(info.content);
    if (parseError || !parsedSkill) {
      return Promise.reject(
        new UserError(`Failed to parse ${info.relativePath}: ${parseError || 'Unknown error'}`)
      );
    }
  }

  return mongoSessionRun(async (session) => {
    const nextVersion = await getNextVersionNumber(skillId, session);

    let storageInfo;
    try {
      storageInfo = await uploadSkillPackage({
        teamId,
        skillId,
        version: nextVersion,
        zipBuffer: packageBuffer
      });
    } catch (error: any) {
      throw new UserError(`Failed to upload package: ${error.message || 'Unknown error'}`);
    }

    await createVersion(
      {
        skillId,
        tmbId,
        version: nextVersion,
        versionName: versionName || `v${nextVersion}`,
        storage: storageInfo
      },
      session
    );
    await updateCurrentStorage(skillId, storageInfo, session);
    await MongoAgentSkills.updateOne(
      { _id: skillId },
      {
        $set: {
          currentVersion: nextVersion,
          versionCount: nextVersion + 1,
          updateTime: new Date()
        }
      },
      { session }
    );
    await setActiveVersion(skillId, nextVersion, session);

    return {
      skillId,
      version: nextVersion,
      versionName: versionName || `v${nextVersion}`,
      storage: { bucket: storageInfo.bucket, key: storageInfo.key, size: storageInfo.size },
      createdAt: new Date().toISOString()
    };
  });
}
