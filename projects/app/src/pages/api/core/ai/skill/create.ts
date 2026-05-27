import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createSkill, updateSkillCreationFailed } from '@fastgpt/service/core/ai/skill/manage';
import { addAgentSkillCreateJob } from '@fastgpt/service/core/ai/skill/manage/creation';
import {
  CreateSkillBodySchema,
  CreateSkillResponseSchema,
  type CreateSkillBody,
  type CreateSkillResponse
} from '@fastgpt/global/core/ai/skill/api';
import {
  AgentSkillCategoryEnum,
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import {
  WritePermissionVal,
  PerResourceTypeEnum,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getDefaultLLMModel } from '@fastgpt/service/core/ai/model';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

async function handler(req: ApiRequestProps<CreateSkillBody>): Promise<CreateSkillResponse> {
  const {
    parentId,
    name,
    description,
    requirements,
    category = [],
    avatar
  } = parseApiInput({ req, bodySchema: CreateSkillBodySchema }).body;

  const requestedName = name.trim();
  const requestedDescription = description?.trim() || '';
  const requestedRequirements = requirements?.trim() || undefined;

  // Authenticate user: if parentId exists, verify parent folder permission
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

  // Validate required fields
  if (requestedName.length === 0) {
    return Promise.reject(SkillErrEnum.invalidSkillName);
  }
  if (requestedName.length > 50) {
    return Promise.reject(SkillErrEnum.skillNameTooLong);
  }
  if (requestedDescription.length > 500) {
    return Promise.reject(SkillErrEnum.invalidDescription);
  }
  if (requestedRequirements && !getDefaultLLMModel()?.model) {
    return Promise.reject(SkillErrEnum.missingModel);
  }
  if (requestedRequirements && requestedRequirements.length > 8000) {
    return Promise.reject(SkillErrEnum.requirementsTooLong);
  }

  const validCategories = Object.values(AgentSkillCategoryEnum) as string[];
  if (category.length > 0 && category.some((c) => !validCategories.includes(c))) {
    return Promise.reject(SkillErrEnum.invalidCategory);
  }

  // Create a visible pending skill first. The slow package generation is handled by BullMQ.
  // E11000 from concurrent duplicate creation propagates as-is (409-like conflict)
  const skillId = await mongoSessionRun(async (session) => {
    const newSkillId = await createSkill(
      {
        parentId: parentId || null,
        name: requestedName,
        description: requestedDescription,
        category: category.length > 0 ? category : [AgentSkillCategoryEnum.other],
        avatar,
        teamId,
        tmbId,
        creationStatus: AgentSkillCreationStatusEnum.creating,
        creationPayload: requestedRequirements ? { requirements: requestedRequirements } : undefined
      },
      session
    );

    await MongoResourcePermission.insertOne(
      {
        teamId,
        tmbId,
        resourceId: newSkillId,
        permission: OwnerRoleVal,
        resourceType: PerResourceTypeEnum.agentSkill
      },
      { session }
    );

    await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

    return newSkillId;
  });

  const createJobData = {
    skillId,
    teamId,
    tmbId,
    name: requestedName,
    description: requestedDescription,
    requirements: requestedRequirements
  };

  try {
    await addAgentSkillCreateJob(createJobData);
  } catch (error) {
    const errorText = getErrText(error, 'Skill creation failed');
    await updateSkillCreationFailed({
      skillId,
      error: errorText
    });
    logger.error('Failed to enqueue skill creation job, marked skill creation failed', {
      skillId,
      teamId,
      error
    });
  }

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_SKILL,
      params: { skillName: requestedName, skillType: getI18nSkillType(AgentSkillTypeEnum.skill) }
    });
  })();

  return CreateSkillResponseSchema.parse(skillId);
}

export default NextAPI(handler);
