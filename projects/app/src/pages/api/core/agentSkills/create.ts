import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  createSkill,
  checkSkillNameExists,
  updateCurrentStorage
} from '@fastgpt/service/core/agentSkills/controller';
import { buildSkillMd, generateSkillMd } from '@fastgpt/service/core/agentSkills/skillMdBuilder';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import { uploadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import { createVersion } from '@fastgpt/service/core/agentSkills/version/controller';
import type { CreateSkillBody, CreateSkillResponse } from '@fastgpt/global/core/agentSkills/api';
import {
  AgentSkillCategoryEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import {
  WritePermissionVal,
  PerResourceTypeEnum,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

async function handler(req: ApiRequestProps<CreateSkillBody>): Promise<CreateSkillResponse> {
  const {
    parentId,
    name,
    description,
    requirements,
    model,
    category = [],
    config = {},
    avatar
  } = req.body;

  // Authenticate user: if parentId exists, verify parent folder permission
  const { teamId, tmbId, userId } = parentId
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
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Promise.reject(SkillErrEnum.invalidSkillName);
  }
  if (name.length > 50) {
    return Promise.reject(SkillErrEnum.invalidSkillName);
  }
  if (description && description.length > 500) {
    return Promise.reject(SkillErrEnum.invalidDescription);
  }
  if (requirements && !model) {
    return Promise.reject(SkillErrEnum.missingModel);
  }
  if (requirements && requirements.length > 8000) {
    return Promise.reject(SkillErrEnum.requirementsTooLong);
  }

  const validCategories = Object.values(AgentSkillCategoryEnum) as string[];
  if (category.length > 0 && category.some((c) => !validCategories.includes(c))) {
    return Promise.reject(SkillErrEnum.invalidCategory);
  }
  if (config && JSON.stringify(config).length > 50_000) {
    return Promise.reject(SkillErrEnum.invalidConfig);
  }

  // Check if skill name already exists in the same parent folder
  const nameExists = await checkSkillNameExists(name.trim(), teamId, parentId || null);
  if (nameExists) {
    return Promise.reject(SkillErrEnum.skillNameExists);
  }

  // Generate SKILL.md content
  let skillMd: string;

  if (requirements && model) {
    logger.debug('Using AI-assisted skill generation', {
      name: name.trim(),
      hasDescription: !!description,
      requirementsLength: requirements.length,
      model
    });

    const [generatedSkillMd, usage] = await generateSkillMd({
      name: name.trim(),
      description: description?.trim() || '',
      requirements: requirements.trim(),
      model
    });

    skillMd = generatedSkillMd;

    logger.debug('AI skill generation completed', {
      skillMdLength: skillMd.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });

    const { totalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });

    createUsage({
      teamId,
      tmbId,
      appName: i18nT('common:support.wallet.usage.Assist Generate Skill'),
      totalPoints,
      source: UsageSourceEnum.assist_generate_skill,
      list: [
        {
          moduleName: i18nT('common:support.wallet.usage.Assist Generate Skill'),
          amount: totalPoints,
          model: modelName,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        }
      ]
    });
  } else {
    logger.debug('Using simple skill generation', {
      name: name.trim(),
      hasDescription: !!description
    });

    skillMd = buildSkillMd({
      name: name.trim(),
      description: description?.trim() || ''
    });
  }

  // Create skill with full workflow (transaction)
  // E11000 from concurrent duplicate creation propagates as-is (409-like conflict)
  const skillId = await mongoSessionRun(async (session) => {
    const zipBuffer = await createSkillPackage({ name: name.trim(), skillMd });

    const newSkillId = await createSkill(
      {
        parentId: parentId || null,
        name: name.trim(),
        description: description?.trim() || '',
        author: userId || '',
        category: category.length > 0 ? category : [AgentSkillCategoryEnum.other],
        config,
        avatar,
        teamId,
        tmbId
      },
      session
    );

    const storageInfo = await uploadSkillPackage({
      teamId,
      skillId: newSkillId,
      version: 0,
      zipBuffer
    });

    await updateCurrentStorage(newSkillId, storageInfo, session);

    await createVersion(
      {
        skillId: newSkillId,
        tmbId,
        version: 0,
        versionName: 'Initial creation',
        storage: storageInfo
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

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_SKILL,
      params: { skillName: name.trim(), skillType: getI18nSkillType(AgentSkillTypeEnum.skill) }
    });
  })();

  return skillId;
}

export default NextAPI(handler);
