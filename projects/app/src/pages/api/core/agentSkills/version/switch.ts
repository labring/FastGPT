import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  type SwitchSkillVersionBody,
  type SwitchSkillVersionResponse
} from '@fastgpt/global/openapi/core/agentSkills/api';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type { SwitchSkillVersionBody, SwitchSkillVersionResponse };

async function handler(
  req: ApiRequestProps<SwitchSkillVersionBody>
): Promise<SwitchSkillVersionResponse> {
  const { skillId, versionId } = req.body;
  await authSkill({ skillId, req, per: WritePermissionVal, authToken: true, authApiKey: true });

  const targetVersion = await MongoAgentSkillsVersion.findOne({
    _id: versionId,
    skillId,
    isDeleted: false
  }).lean();

  if (!targetVersion) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  await mongoSessionRun(async (session) => {
    await MongoAgentSkillsVersion.updateMany(
      { skillId, isActive: true },
      { isActive: false },
      { session }
    );

    await MongoAgentSkillsVersion.updateOne(
      { _id: versionId, skillId, isDeleted: false },
      { isActive: true },
      { session }
    );

    const result = await MongoAgentSkills.updateOne(
      { _id: skillId, deleteTime: null },
      {
        $set: {
          currentVersion: targetVersion.version,
          currentStorage: {
            bucket: targetVersion.storage.bucket,
            key: targetVersion.storage.key,
            size: targetVersion.storage.size
          },
          updateTime: new Date()
        }
      },
      { session }
    );

    if (result.matchedCount === 0) {
      throw new UserError('Skill not found');
    }
  });

  const editSandboxes = await MongoSandboxInstance.find({
    appId: skillId,
    chatId: 'edit-debug',
    'metadata.sandboxType': SandboxTypeEnum.editDebug
  }).lean();

  await Promise.allSettled(
    editSandboxes.map(async (sandbox) => {
      const client = await getSandboxClient({ sandboxId: sandbox.sandboxId });
      await client.delete().catch((err) => {
        logger.error('Failed to delete edit-debug sandbox on version switch', {
          sandboxId: sandbox.sandboxId,
          error: err
        });
      });
    })
  );

  return;
}

export default NextAPI(handler);
