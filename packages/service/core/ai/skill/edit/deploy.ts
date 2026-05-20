import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { Types } from '../../../../common/mongo';
import { updateCurrentVersion } from '../manage';
import {
  normalizeSkillPackageZipForSandbox,
  removeSkillPackageTTL,
  uploadSkillPackage
} from '../package';
import { packageSkillInSandbox } from './sandbox';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from './config';
import { createVersion } from '../version';
import { getSkillsRootPath } from '../runtime';
import { findSandboxInstanceByAppChatType } from '../../sandbox/instance';
import { getSandboxDefaults, getSandboxProviderConfig } from '../../sandbox/config';
import { MongoAgentSkills } from '../model/schema';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { SaveDeploySkillResponse } from '@fastgpt/global/core/ai/skill/api';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';

export type SaveDeploySkillFromSandboxParams = {
  skillId: string;
  teamId: string;
  tmbId: string;
  versionName?: string;
};

/**
 * 从 edit-debug sandbox 打包当前编辑内容，并发布为新的当前版本。
 *
 * API 层负责鉴权和创建状态校验；这里聚焦保存发布的业务动作：定位 edit sandbox、
 * 打包 sandbox 工作目录下的 skills、上传对象存储、创建版本并切为当前版本。
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
    packageBuffer = await packageSkillInSandbox({
      sandboxId: sandboxInfo.sandboxId,
      workDirectory: getSkillsRootPath(defaults.workDirectory)
    });
    packageBuffer = await normalizeSkillPackageZipForSandbox(packageBuffer);
  } catch (error: any) {
    return Promise.reject(
      new UserError(`Failed to package skill directory: ${error.message || 'Unknown error'}`)
    );
  }

  const versionId = new Types.ObjectId().toString();
  const createdAt = new Date();
  const resolvedVersionName = versionName || formatTime2YMDHMS(createdAt);

  let storageInfo;
  try {
    storageInfo = await uploadSkillPackage({
      teamId,
      skillId,
      packageObjectId: versionId,
      zipBuffer: packageBuffer
    });
  } catch (error: any) {
    if (error?.message === SkillErrEnum.archiveTooLarge) {
      return Promise.reject(SkillErrEnum.archiveTooLarge);
    }
    throw new UserError(`Failed to upload package: ${error.message || 'Unknown error'}`);
  }

  return mongoSessionRun(async (session) => {
    await createVersion(
      {
        versionId,
        skillId,
        tmbId,
        versionName: resolvedVersionName,
        storageKey: storageInfo.key
      },
      session
    );
    await updateCurrentVersion(skillId, versionId, session);
    await MongoAgentSkills.updateOne(
      { _id: skillId },
      {
        $set: {
          updateTime: createdAt
        }
      },
      { session }
    );
    await removeSkillPackageTTL(storageInfo.key, session);

    return {
      skillId,
      versionId,
      versionName: resolvedVersionName,
      storageKey: storageInfo.key,
      createdAt: createdAt.toISOString()
    };
  });
}
