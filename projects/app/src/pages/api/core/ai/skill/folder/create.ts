import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createSkillFolder } from '@fastgpt/service/core/ai/skill/manage';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  CreateSkillFolderBodySchema,
  type CreateSkillFolderBody
} from '@fastgpt/global/core/ai/skill/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<CreateSkillFolderBody>) {
  const { name, description, parentId } = parseApiInput({
    req,
    bodySchema: CreateSkillFolderBodySchema
  }).body;

  if (!name) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // If parentId is provided, verify write permission on the parent; otherwise check team permission
  const { teamId, tmbId } = parentId
    ? await authSkill({
        req,
        skillId: parentId,
        per: WritePermissionVal,
        authToken: true,
        authApiKey: true
      })
    : await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamSkillCreatePermissionVal
      });

  // Create the folder within a transaction and copy collaborators from parent
  const folderId = await mongoSessionRun(async (session) => {
    const folder = await createSkillFolder(
      {
        name,
        description,
        parentId,
        teamId,
        tmbId
      },
      session
    );

    // Create default collaborators (copy from parent if exists)
    await createResourceDefaultCollaborators({
      tmbId,
      session,
      resource: folder,
      resourceType: PerResourceTypeEnum.agentSkill
    });

    return folder._id.toString();
  });

  // Add audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_SKILL_FOLDER,
      params: {
        folderName: name
      }
    });
  })();

  return { folderId };
}

export default NextAPI(handler);
