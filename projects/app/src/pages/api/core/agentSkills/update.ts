import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updateSkill, checkSkillNameExists } from '@fastgpt/service/core/agentSkills/controller';
import type { UpdateSkillBody, UpdateSkillResponse } from '@fastgpt/global/core/agentSkills/api';
import { AgentSkillCategoryEnum } from '@fastgpt/global/core/agentSkills/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { isValidObjectId } from 'mongoose';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }

    const { skillId, name, description, category, config, avatar } = req.body as UpdateSkillBody;

    if (!skillId) {
      return jsonRes(res, { code: 400, error: 'Skill ID is required' });
    }

    if (!isValidObjectId(skillId)) {
      return jsonRes(res, { code: 400, error: 'Invalid skill ID format' });
    }

    // Verify write permission via authSkill (replaces authUserPer + canModifySkill)
    const { teamId, tmbId, skill } = await authSkill({
      req,
      skillId,
      per: WritePermissionVal,
      authToken: true,
      authApiKey: true
    });

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return jsonRes(res, { code: 400, error: 'Skill name cannot be empty' });
      }

      if (name.length > 50) {
        return jsonRes(res, { code: 400, error: 'Skill name must be less than 50 characters' });
      }

      // Check for name uniqueness (excluding current skill)
      const nameExists = await checkSkillNameExists(name.trim(), teamId, skillId);
      if (nameExists) {
        return jsonRes(res, { code: 409, error: 'Skill name already exists' });
      }
    }

    if (description !== undefined && description.length > 500) {
      return jsonRes(res, { code: 400, error: 'Description must be less than 500 characters' });
    }

    if (category !== undefined) {
      const validCategories = Object.values(AgentSkillCategoryEnum) as string[];
      if (category.some((c) => !validCategories.includes(c))) {
        return jsonRes(res, { code: 400, error: 'Invalid category value' });
      }
    }

    if (config !== undefined && JSON.stringify(config).length > 50_000) {
      return jsonRes(res, { code: 400, error: 'Config exceeds maximum allowed size (50KB)' });
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (category !== undefined) updateData.category = category;
    if (config !== undefined) updateData.config = config;
    if (avatar !== undefined) updateData.avatar = avatar;

    if (Object.keys(updateData).length === 0) {
      return jsonRes(res, { code: 400, error: 'No fields to update' });
    }

    await mongoSessionRun(async (session) => {
      return updateSkill(skillId, updateData, session);
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.UPDATE_SKILL,
        params: { skillName: skill.name }
      });
    })();

    jsonRes<UpdateSkillResponse>(res, { data: undefined });
  } catch (err: any) {
    // E11000: unique index violation (concurrent duplicate name update)
    if (err.code === 11000 || err.codeName === 'DuplicateKey') {
      return jsonRes(res, { code: 409, error: 'Skill name already exists' });
    }
    jsonRes(res, { code: 500, error: err });
  }
}
