/**
 * 沙盒业务层：从 Skill Edit sandbox 保存并发布新的技能版本。
 *
 * API 层负责鉴权和请求校验；本文件负责定位运行态 edit-debug sandbox、打包工作区、
 * 上传版本包、创建版本记录，并同步运行实例的 context.skillVersionId 字段。
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
import { getRunningSkillEditSandbox, packageSkillInSandbox } from './runtime';
import { createVersion } from '../../../skill/version';
import { updateSandboxInstanceRecordBySandboxId } from '../../infrastructure/instance/repository';
import { MongoAgentSkills } from '../../../skill/model/schema';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import type { SaveDeploySkillResponse } from '@fastgpt/global/core/ai/skill/api';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

type SaveDeploySkillFromSandboxParams = {
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
  const sandboxInfo = await getRunningSkillEditSandbox({ skillId, teamId });
  if (!sandboxInfo) {
    throw new UserError('Edit sandbox not found or not running');
  }

  let packageBuffer: Buffer;
  try {
    packageBuffer = await packageSkillInSandbox({
      sandboxId: sandboxInfo.sandboxId,
      instanceId: sandboxInfo.instanceId
    });
  } catch (error) {
    throw new UserError(`Failed to package skill directory: ${getErrText(error)}`);
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
  } catch (error) {
    const errorText = getErrText(error);
    if (errorText === SkillErrEnum.archiveTooLarge) {
      throw SkillErrEnum.archiveTooLarge;
    }
    throw new UserError(`Failed to upload package: ${errorText}`);
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

    // 在同一事务内同步运行中编辑沙盒的 context.skillVersionId，防止进程崩溃导致下次打开编辑页误判版本不一致清空工作区
    const updatedSandboxInfo = await updateSandboxInstanceRecordBySandboxId({
      sandboxId: sandboxInfo.sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: ChatSourceTypeEnum.skillEdit,
      context: {
        skillVersionId: versionId
      },
      touchActive: true,
      session
    });
    if (!updatedSandboxInfo) {
      logger.warn(
        '[Sandbox] Skip updating sandbox skillVersionId after deploy because sandbox state changed',
        {
          sandboxId: sandboxInfo.sandboxId,
          versionId
        }
      );
    }

    return {
      skillId,
      versionId,
      versionName: resolvedVersionName,
      storageKey: storageInfo.key,
      createdAt: createdAt.toISOString()
    };
  });

  return deployResult;
}
