import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  createSkill,
  checkSkillNameExists,
  updateCurrentStorage
} from '@fastgpt/service/core/agentSkills/controller';
import { buildSkillMd } from '@fastgpt/service/core/agentSkills/skillMdBuilder';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import { uploadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import { createVersion } from '@fastgpt/service/core/agentSkills/versionController';
import type { CreateSkillBody, CreateSkillResponse } from '@fastgpt/global/core/agentSkills/api';
import { AgentSkillCategoryEnum } from '@fastgpt/global/core/agentSkills/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return jsonRes(res, {
        code: 405,
        error: 'Method not allowed'
      });
    }

    // Authenticate user
    const { teamId, tmbId, userId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Get request body
    const { name, description, category = [], config = {}, avatar } = req.body as CreateSkillBody;

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

    // Validate category enum values
    const validCategories = Object.values(AgentSkillCategoryEnum) as string[];
    if (category.length > 0 && category.some((c) => !validCategories.includes(c))) {
      return jsonRes(res, { code: 400, error: 'Invalid category value' });
    }

    // Validate config size (max 50 KB)
    if (config && JSON.stringify(config).length > 50_000) {
      return jsonRes(res, { code: 400, error: 'Config exceeds maximum allowed size (50KB)' });
    }

    // Check if skill name already exists
    const nameExists = await checkSkillNameExists(name.trim(), teamId);
    if (nameExists) {
      return jsonRes(res, {
        code: 409,
        error: 'Skill name already exists'
      });
    }

    // Create skill with full workflow (transaction)
    const skillId = await mongoSessionRun(async (session) => {
      // 1. Build SKILL.md content
      const skillMd = buildSkillMd({
        name: name.trim(),
        description: description?.trim() || ''
      });

      // 2. Create ZIP package
      const zipBuffer = await createSkillPackage({
        name: name.trim(),
        skillMd
      });

      // 3. Create skill record first (to get the skillId)
      const newSkillId = await createSkill(
        {
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

      // 4. Upload ZIP to MinIO
      const storageInfo = await uploadSkillPackage({
        teamId,
        skillId: newSkillId,
        version: 0,
        zipBuffer
      });

      // 5. Update skill's currentStorage field
      await updateCurrentStorage(newSkillId, storageInfo, session);

      // 6. Create v0 version record
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

    jsonRes<CreateSkillResponse>(res, {
      data: skillId
    });
  } catch (err: any) {
    // E11000: unique index violation (concurrent duplicate name creation)
    if (err.code === 11000 || err.codeName === 'DuplicateKey') {
      return jsonRes(res, { code: 409, error: 'Skill name already exists' });
    }
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
