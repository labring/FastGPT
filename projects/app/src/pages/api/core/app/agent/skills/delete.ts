import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { deleteSkill, canModifySkill } from '@fastgpt/service/core/agentSkills/controller';
import type { DeleteSkillQuery, DeleteSkillResponse } from '@fastgpt/global/core/agentSkills/api';
import { isValidObjectId } from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only accept DELETE requests
    if (req.method !== 'DELETE') {
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

    // Get query parameters
    const { skillId } = req.query as unknown as DeleteSkillQuery;

    // Validate skillId
    if (!skillId) {
      return jsonRes(res, {
        code: 400,
        error: 'Skill ID is required'
      });
    }

    if (!isValidObjectId(skillId)) {
      return jsonRes(res, { code: 400, error: 'Invalid skill ID format' });
    }

    // Check if user can delete this skill
    const canDelete = await canModifySkill(skillId, tmbId);
    if (!canDelete) {
      return jsonRes(res, {
        code: 403,
        error: 'You do not have permission to delete this skill'
      });
    }

    // Delete skill with transaction
    await mongoSessionRun(async (session) => {
      return deleteSkill(skillId, session);
    });

    jsonRes<DeleteSkillResponse>(res, {
      data: undefined
    });
  } catch (err: any) {
    // Handle specific errors
    if (err.message === 'Skill not found') {
      return jsonRes(res, {
        code: 404,
        error: 'Skill not found'
      });
    }

    if (err.message === 'Cannot delete system skill') {
      return jsonRes(res, {
        code: 403,
        error: 'System skills cannot be deleted'
      });
    }

    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
