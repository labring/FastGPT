import archiver from 'archiver';
import { NextAPI } from '@/service/middleware/entry';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { ExportSkillQuerySchema } from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { buildSkillAuditResource } from '@fastgpt/global/support/user/audit/type';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { streamSkillEditWorkspaceZip } from '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime';

export const config = {
  api: {
    responseLimit: false
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

  const filename = `${skill.name}.zip`;
  const abortController = new AbortController();
  const onResponseClose = () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  };
  res.once('close', onResponseClose);

  try {
    await streamSkillEditWorkspaceZip({
      skillId,
      teamId,
      signal: abortController.signal,
      outputStream: res as unknown as NodeJS.WritableStream,
      createArchive: () => archiver('zip', { zlib: { level: 6 } }),
      onHeadersReady: () => {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        res.setHeader('Cache-Control', 'no-store');
        res.status(200);
      }
    });
  } finally {
    res.off('close', onResponseClose);
  }

  void addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.EXPORT_SKILL,
    resources: [
      buildSkillAuditResource({
        _id: skillId,
        name: skill.name,
        avatar: skill.avatar,
        type: skill.type
      })
    ],
    params: {
      skillName: skill.name,
      skillType: getI18nSkillType(skill.type)
    }
  });
}

export default NextAPI(handler);
