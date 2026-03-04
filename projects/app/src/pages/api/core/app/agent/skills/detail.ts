import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getSkillById } from '@fastgpt/service/core/agentSkill/controller';
import type {
  GetSkillDetailQuery,
  GetSkillDetailResponse
} from '@fastgpt/global/core/agentSkill/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Authenticate user
    const { teamId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Get query parameters
    const { skillId } = req.query as unknown as GetSkillDetailQuery;

    // Validate skillId
    if (!skillId) {
      return jsonRes(res, {
        code: 400,
        error: 'Skill ID is required'
      });
    }

    // Get skill
    const skill = await getSkillById(skillId);

    if (!skill) {
      return jsonRes(res, {
        code: 404,
        error: 'Skill not found'
      });
    }

    // Check access permission for personal skills
    if (skill.source === 'personal' && skill.teamId !== teamId) {
      return jsonRes(res, {
        code: 403,
        error: 'You do not have access to this skill'
      });
    }

    // Format response
    const response: GetSkillDetailResponse = {
      _id: skill._id,
      source: skill.source,
      name: skill.name,
      description: skill.description,
      author: skill.author,
      category: skill.category,
      config: skill.config,
      avatar: skill.avatar,
      teamId: skill.teamId,
      tmbId: skill.tmbId,
      createTime: skill.createTime?.toISOString() || new Date().toISOString(),
      updateTime: skill.updateTime?.toISOString() || new Date().toISOString()
    };

    jsonRes<GetSkillDetailResponse>(res, {
      data: response
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
