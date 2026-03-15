import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getSkillById } from '@fastgpt/service/core/agentSkills/controller';
import { downloadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import type { ExportSkillQuery } from '@fastgpt/global/core/agentSkills/api';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { isValidObjectId } from '@fastgpt/service/common/mongo';

export const config = {
  api: {
    responseLimit: '200mb'
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }

    const { teamId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    const { skillId } = req.query as unknown as ExportSkillQuery;

    if (!skillId) {
      return jsonRes(res, { code: 400, error: 'Skill ID is required' });
    }

    if (!isValidObjectId(skillId)) {
      return jsonRes(res, { code: 400, error: 'Invalid skill ID format' });
    }

    const skill = await getSkillById(skillId);

    if (!skill) {
      return jsonRes(res, { code: 404, error: 'Skill not found' });
    }

    if (skill.type === AgentSkillTypeEnum.folder) {
      return jsonRes(res, { code: 400, error: 'Folders cannot be exported' });
    }

    if (!skill.currentStorage) {
      return jsonRes(res, { code: 404, error: 'No active version available for download' });
    }

    if (skill.source === 'personal' && skill.teamId?.toString() !== String(teamId)) {
      return jsonRes(res, { code: 403, error: 'You do not have access to this skill' });
    }

    const zipBuffer = await downloadSkillPackage({ storageInfo: skill.currentStorage });

    const filename = `${skill.name}.zip`.replace(/[^\w\s.\-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).end(zipBuffer);
  } catch (err) {
    jsonRes(res, { code: 500, error: err });
  }
}
