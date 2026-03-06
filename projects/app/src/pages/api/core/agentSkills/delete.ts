import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { deleteSkill } from '@fastgpt/service/core/agentSkills/controller';
import type { DeleteSkillQuery, DeleteSkillResponse } from '@fastgpt/global/core/agentSkills/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'DELETE') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }

    const { skillId } = req.query as unknown as DeleteSkillQuery;

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

    await mongoSessionRun(async (session) => {
      return deleteSkill(skillId, session);
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.DELETE_SKILL,
        params: { skillName: skill.name }
      });
    })();

    jsonRes<DeleteSkillResponse>(res, { data: undefined });
  } catch (err: any) {
    jsonRes(res, { code: 500, error: err });
  }
}
