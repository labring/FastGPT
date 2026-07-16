import { NextAPI } from '@/service/middleware/entry';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { ExportSkillQuerySchema } from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/types';
import {
  packageSkillEditWorkspace,
  SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR
} from '@fastgpt/service/core/ai/sandbox/interface/skillEdit';

export const config = {
  api: {
    responseLimit: '200mb'
  }
};

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.EXPORT);

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { skillId } = parseApiInput({ req, querySchema: ExportSkillQuerySchema }).query;

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

  logger.debug('Exporting skill edit workspace', { skillId, skillName: skill.name });

  let zipBuffer: Buffer;
  try {
    zipBuffer = await packageSkillEditWorkspace({
      skillId,
      teamId,
      validationMode: 'basicZip'
    });
  } catch (error) {
    if (error instanceof Error && error.message === SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR) {
      return jsonRes(res, { code: 404, error: SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR });
    }

    throw error;
  }

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
}

export default NextAPI(handler);
