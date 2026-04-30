import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { downloadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import type { ExportSkillQuery } from '@fastgpt/global/core/agentSkills/api';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

export const config = {
  api: {
    responseLimit: '200mb'
  }
};

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.EXPORT);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }

    const { skillId } = req.query as unknown as ExportSkillQuery;

    const { teamId, tmbId, skill } = await authSkill({
      req,
      skillId,
      per: ReadPermissionVal,
      authToken: true,
      authApiKey: true
    });

    if (skill.type === AgentSkillTypeEnum.folder) {
      return jsonRes(res, { code: 400, error: 'Folders cannot be exported' });
    }

    if (!skill.currentStorage) {
      return jsonRes(res, { code: 404, error: 'No active version available for download' });
    }

    logger.debug('Exporting skill', { skillId, skillName: skill.name });

    const zipBuffer = await downloadSkillPackage({ storageInfo: skill.currentStorage });

    const filename = `${skill.name}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Content-Length', zipBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).end(zipBuffer);

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.EXPORT_SKILL,
        params: {
          skillName: skill.name,
          skillType: getI18nSkillType(skill.type)
        }
      });
    })();
  } catch (err: any) {
    logger.error('Export skill error', { error: err });
    jsonRes(res, { code: 500, error: err?.message || 'Failed to export skill' });
  }
}
