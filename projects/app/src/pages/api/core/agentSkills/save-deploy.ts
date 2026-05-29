import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updateCurrentStorage } from '@fastgpt/service/core/agentSkills/controller';
import {
  createVersion,
  getNextVersionNumber,
  setActiveVersion
} from '@fastgpt/service/core/agentSkills/version/controller';
import {
  downloadSkillPackage,
  uploadSkillPackage
} from '@fastgpt/service/core/agentSkills/storage';
import {
  mutateZip,
  validatePackagePath,
  zipWriteText
} from '@fastgpt/service/core/agentSkills/packageEditor';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import type {
  SaveDeploySkillBody,
  SaveDeploySkillResponse
} from '@fastgpt/global/core/agentSkills/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

/**
 * 把 AgentSkillEditor 当前所有未保存的文件作为一份完整变更打包成新版本，
 * 并将其标记为 active。不依赖 sandbox。
 */
async function handler(
  req: ApiRequestProps<SaveDeploySkillBody>
): Promise<SaveDeploySkillResponse> {
  const { skillId, versionName, files } = req.body;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: WritePermissionVal,
    authToken: true,
    authApiKey: true
  });

  if (!skill.currentStorage) {
    return Promise.reject(new UserError('Skill has no current package; import or create first.'));
  }

  const normalizedFiles = files.map((f) => ({
    path: validatePackagePath(f.path),
    content: f.content
  }));

  const baseBuffer = await downloadSkillPackage({ storageInfo: skill.currentStorage });
  const newBuffer = await mutateZip(baseBuffer, (zip) => {
    for (const f of normalizedFiles) {
      zipWriteText(zip, f.path, f.content);
    }
  });

  const response = await mongoSessionRun(async (session) => {
    const nextVersion = await getNextVersionNumber(skillId, session);

    const storageInfo = await uploadSkillPackage({
      teamId,
      skillId,
      version: nextVersion,
      zipBuffer: newBuffer
    });

    const resolvedVersionName = versionName || `v${nextVersion}`;

    await createVersion(
      {
        skillId,
        tmbId,
        version: nextVersion,
        versionName: resolvedVersionName,
        storage: storageInfo
      },
      session
    );
    await setActiveVersion(skillId, nextVersion, session);
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

    return {
      skillId,
      version: nextVersion,
      versionName: resolvedVersionName,
      storage: { bucket: storageInfo.bucket, key: storageInfo.key, size: storageInfo.size },
      createdAt: new Date().toISOString()
    };
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DEPLOY_SKILL,
      params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
    });
  })();

  return response;
}

export default NextAPI(handler);
