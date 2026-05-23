import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { deleteSandboxResource } from '@fastgpt/service/core/ai/sandbox/service/resource';
import { findSandboxResourcesByAppChatType } from '@fastgpt/service/core/ai/sandbox/instance/repository';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '@fastgpt/service/core/ai/skill/edit/config';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/provider/config';
import {
  SwitchSkillVersionBodySchema,
  type SwitchSkillVersionBody,
  type SwitchSkillVersionResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type { SwitchSkillVersionBody, SwitchSkillVersionResponse };

async function handler(
  req: ApiRequestProps<SwitchSkillVersionBody>
): Promise<SwitchSkillVersionResponse> {
  const { skillId, versionId } = parseApiInput({
    req,
    bodySchema: SwitchSkillVersionBodySchema
  }).body;
  await authSkill({ skillId, req, per: WritePermissionVal, authToken: true, authApiKey: true });

  const targetVersion = await MongoAgentSkillsVersion.findOne({
    _id: versionId,
    skillId
  }).lean();

  if (!targetVersion) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  await mongoSessionRun(async (session) => {
    const result = await MongoAgentSkills.updateOne(
      { _id: skillId, deleteTime: null },
      {
        $set: {
          currentVersionId: targetVersion._id,
          updateTime: new Date()
        }
      },
      { session }
    );

    if (result.matchedCount === 0) {
      throw new UserError('Skill not found');
    }
  });

  const providerConfig = getSandboxProviderConfig();
  const editSandboxes = await findSandboxResourcesByAppChatType({
    provider: providerConfig.provider,
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    type: SandboxTypeEnum.editDebug
  });

  await Promise.allSettled(
    editSandboxes.map(async (sandbox) => {
      await deleteSandboxResource(sandbox).catch((err) => {
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
