/**
 * 沙盒业务层：从 Skill Edit sandbox 保存并发布新的技能版本。
 *
 * API 层负责鉴权和请求校验；本文件负责定位运行态 edit-debug sandbox、打包工作区、
 * 上传版本包、创建版本记录，并同步运行实例的版本元数据。
 */
import { mongoSessionRun } from '../../../../../common/mongo/sessionRun';
import { Types } from '../../../../../common/mongo';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { updateCurrentVersion } from '../../../skill/manage';
import {
  extractRuntimeSkillsFromPackage,
  removeSkillPackageTTL,
  uploadSkillPackage
} from '../../../skill/package';
import { packageSkillInSandbox } from './runtime';
import { getEditDebugSandboxId } from '../../../skill/edit/config';
import { createVersion } from '../../../skill/version';
import { getSandboxRuntimeProfile } from '../../infrastructure/provider/runtimeProfile';
import { getSandboxProviderConfig } from '../../infrastructure/provider/config';
import {
  findSandboxInstanceBySandboxIdAndSource,
  updateSandboxInstanceRecordBySandboxId
} from '../../infrastructure/instance/repository';
import { MongoAgentSkills } from '../../../skill/model/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { SaveDeploySkillResponse } from '@fastgpt/global/core/ai/skill/api';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

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
  const sandboxInfo = await findSandboxInstanceBySandboxIdAndSource({
    provider: providerConfig.provider,
    sandboxId: getEditDebugSandboxId(skillId),
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId,
    status: SandboxStatusEnum.running
  });

  if (
    !sandboxInfo ||
    sandboxInfo.status !== SandboxStatusEnum.running ||
    sandboxInfo.metadata?.teamId !== teamId
  ) {
    return Promise.reject(new UserError('Edit sandbox not found or not running'));
  }

  let packageBuffer: Buffer;
  try {
    const runtimeProfile = getSandboxRuntimeProfile(providerConfig.provider);
    packageBuffer = await packageSkillInSandbox({
      sandboxId: sandboxInfo.sandboxId,
      workDirectory: runtimeProfile.workDirectory
    });
  } catch (error: any) {
    return Promise.reject(
      new UserError(`Failed to package skill directory: ${error.message || 'Unknown error'}`)
    );
  }

  const versionId = new Types.ObjectId().toString();
  const createdAt = new Date();
  const resolvedVersionName = versionName || formatTime2YMDHMS(createdAt);
  const runtimeSkills = await extractRuntimeSkillsFromPackage(packageBuffer);

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

  const deployResult = await mongoSessionRun(async (session) => {
    const isVersionLinked = await updateCurrentVersion({
      skillId,
      currentVersionId: versionId,
      runtimeSkills,
      session
    });
    if (!isVersionLinked) {
      // skill 可能在打包上传期间被删除。此时不能移除 S3 TTL，让孤儿包继续走 TTL 清理。
      throw new UserError('Skill not found');
    }

    await createVersion(
      {
        versionId,
        skillId,
        tmbId,
        versionName: resolvedVersionName,
        storageKey: storageInfo.key,
        runtimeSkills
      },
      session
    );
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

  // 发布新版本成功后，更新运行中沙盒实例的 versionId，保证后续版本切换时能够正确执行版本比对和容器重建
  const updatedSandboxInfo = await updateSandboxInstanceRecordBySandboxId({
    provider: providerConfig.provider,
    sandboxId: sandboxInfo.sandboxId,
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId,
    metadata: {
      ...(sandboxInfo.metadata || {}),
      versionId
    },
    touchActive: true
  }).catch((err) => {
    logger.error('[Sandbox] Failed to update sandbox versionId after deploy', {
      sandboxId: sandboxInfo.sandboxId,
      versionId,
      error: err
    });
    return null;
  });
  if (!updatedSandboxInfo) {
    logger.warn(
      '[Sandbox] Skip updating sandbox versionId after deploy because sandbox state changed',
      {
        sandboxId: sandboxInfo.sandboxId,
        versionId
      }
    );
  }

  return deployResult;
}
