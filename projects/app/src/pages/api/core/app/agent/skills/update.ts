import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  updateSkill,
  canModifySkill,
  checkSkillNameExists
} from '@fastgpt/service/core/agentSkill/controller';
import type { UpdateSkillBody, UpdateSkillResponse } from '@fastgpt/global/core/agentSkill/api';

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
    const { tmbId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Get request body
    const { skillId, name, description, category, config, avatar } = req.body as UpdateSkillBody;

    // Validate skillId
    if (!skillId) {
      return jsonRes(res, {
        code: 400,
        error: 'Skill ID is required'
      });
    }

    // Check if user can modify this skill
    const canModify = await canModifySkill(skillId, tmbId);
    if (!canModify) {
      return jsonRes(res, {
        code: 403,
        error: 'You do not have permission to update this skill'
      });
    }

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return jsonRes(res, {
          code: 400,
          error: 'Skill name cannot be empty'
        });
      }

      if (name.length > 50) {
        return jsonRes(res, {
          code: 400,
          error: 'Skill name must be less than 50 characters'
        });
      }

      // Check for name uniqueness (excluding current skill)
      const { teamId } = await authUserPer({
        req,
        authToken: true,
        authApiKey: true
      });

      const nameExists = await checkSkillNameExists(name.trim(), teamId, skillId);
      if (nameExists) {
        return jsonRes(res, {
          code: 409,
          error: 'Skill name already exists'
        });
      }
    }

    // Validate description length
    if (description !== undefined && description.length > 500) {
      return jsonRes(res, {
        code: 400,
        error: 'Description must be less than 500 characters'
      });
    }

    // Build update data (only include defined fields)
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (category !== undefined) updateData.category = category;
    if (config !== undefined) updateData.config = config;
    if (avatar !== undefined) updateData.avatar = avatar;

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return jsonRes(res, {
        code: 400,
        error: 'No fields to update'
      });
    }

    // Update skill with transaction
    await mongoSessionRun(async (session) => {
      return updateSkill(skillId, updateData, session);
    });

    jsonRes<UpdateSkillResponse>(res, {
      data: undefined
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
