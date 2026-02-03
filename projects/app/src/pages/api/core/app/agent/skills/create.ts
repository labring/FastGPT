import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createSkill, checkSkillNameExists } from '@fastgpt/service/core/agentSkill/controller';
import type { CreateSkillBody, CreateSkillResponse } from '@fastgpt/global/core/agentSkill/api';
import { AgentSkillCategoryEnum } from '@fastgpt/global/core/agentSkill/constants';

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
    const {
      name,
      description,
      markdown,
      category = [],
      config = {},
      avatar
    } = req.body as CreateSkillBody;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return jsonRes(res, {
        code: 400,
        error: 'Skill name is required'
      });
    }

    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
      return jsonRes(res, {
        code: 400,
        error: 'Skill markdown is required'
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

    // Check if skill name already exists
    const nameExists = await checkSkillNameExists(name.trim(), teamId);
    if (nameExists) {
      return jsonRes(res, {
        code: 409,
        error: 'Skill name already exists'
      });
    }

    // Create skill with transaction
    const skillId = await mongoSessionRun(async (session) => {
      return createSkill(
        {
          name: name.trim(),
          description: description?.trim() || '',
          markdown: markdown.trim(),
          author: userId || '',
          category: category.length > 0 ? category : [AgentSkillCategoryEnum.other],
          config,
          avatar,
          teamId,
          tmbId
        },
        session
      );
    });

    jsonRes<CreateSkillResponse>(res, {
      data: skillId
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
