import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
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
import { AgentSkillCategoryEnum } from '@fastgpt/global/core/agentSkills/constants';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return jsonRes(res, {
        code: 405,
        error: 'Method not allowed'
      });
    }

    // Get request body
    const {
      parentId,
      name,
      description,
      requirements,
      model,
      category = [],
      config = {},
      avatar
    } = req.body as CreateSkillBody;

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
          authApiKey: true
        });

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return jsonRes(res, {
        code: 400,
        error: 'Skill name is required'
      });
    }

    // Validate name length
    if (name.length > 50) {
      return jsonRes(res, {
        code: 400,
        error: 'Skill name must be less than 50 characters'
      });
    }

    // Validate description length
    if (description && description.length > 500) {
      return jsonRes(res, {
        code: 400,
        error: 'Description must be less than 500 characters'
      });
    }

    // Validate requirements and model pairing
    if (requirements && !model) {
      return jsonRes(res, {
        code: 400,
        error: 'Model is required when requirements is provided'
      });
    }

    // Validate requirements length
    if (requirements && requirements.length > 8000) {
      return jsonRes(res, {
        code: 400,
        error: 'Requirements must be less than 8000 characters'
      });
    }

    // Validate category enum values
    const validCategories = Object.values(AgentSkillCategoryEnum) as string[];
    if (category.length > 0 && category.some((c) => !validCategories.includes(c))) {
      return jsonRes(res, { code: 400, error: 'Invalid category value' });
    }

    // Validate config size (max 50 KB)
    if (config && JSON.stringify(config).length > 50_000) {
      return jsonRes(res, { code: 400, error: 'Config exceeds maximum allowed size (50KB)' });
    }

    // Check if skill name already exists in the same parent folder
    const nameExists = await checkSkillNameExists(name.trim(), teamId, parentId || null);
    if (nameExists) {
      return jsonRes(res, {
        code: 409,
        error: 'Skill name already exists in this directory'
      });
    }

    // Generate SKILL.md content
    let skillMd: string;

    if (requirements && model) {
      // AI-assisted generation mode
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

      // Log LLM response
      logger.debug('AI skill generation completed', {
        skillMdLength: skillMd.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      });

      // Create usage record for AI generation
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
      // Simple generation mode (frontmatter only)
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
    const skillId = await mongoSessionRun(async (session) => {
      // 1. Create ZIP package
      const zipBuffer = await createSkillPackage({
        name: name.trim(),
        skillMd
      });

      // 2. Create skill record first (to get the skillId)
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

      // 3. Upload ZIP to MinIO
      const storageInfo = await uploadSkillPackage({
        teamId,
        skillId: newSkillId,
        version: 0,
        zipBuffer
      });

      // 4. Update skill's currentStorage field
      await updateCurrentStorage(newSkillId, storageInfo, session);

      // 5. Create v0 version record
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

      return newSkillId;
    });

    // Add audit log
    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.CREATE_SKILL,
        params: {
          skillName: name.trim()
        }
      });
    })();

    jsonRes<CreateSkillResponse>(res, {
      data: skillId
    });
  } catch (err: any) {
    logger.error('Create skill error', { error: err });

    // E11000: unique index violation (concurrent duplicate name creation)
    if (err.code === 11000 || err.codeName === 'DuplicateKey') {
      return jsonRes(res, { code: 409, error: 'Skill name already exists' });
    }

    jsonRes(res, {
      code: 500,
      error: err?.message || 'Failed to create skill'
    });
  }
}
