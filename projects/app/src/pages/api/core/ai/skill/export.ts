import { NextAPI } from '@/service/middleware/entry';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { downloadSkillPackage } from '@fastgpt/service/core/ai/skill/package';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { ExportSkillQuerySchema } from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { AgentSkillTypeEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { findSandboxInstanceByAppChatType } from '@fastgpt/service/core/ai/sandbox/instance/repository';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/provider/config';
import { getSandboxRuntimeProfile } from '@fastgpt/service/core/ai/sandbox/runtime/profile';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  packageSkillInSandbox
} from '@fastgpt/service/core/ai/skill/edit';

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

  const { skillId, source } = parseApiInput({ req, querySchema: ExportSkillQuerySchema }).query;

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

  if (source === 'version' && !skill.currentVersionId) {
    return jsonRes(res, { code: 404, error: 'No current version available for download' });
  }

  logger.debug('Exporting skill', { skillId, skillName: skill.name, source });

  let zipBuffer: Buffer;
  if (source === 'workspace') {
    const providerConfig = getSandboxProviderConfig();
    const sandboxInfo = await findSandboxInstanceByAppChatType({
      provider: providerConfig.provider,
      appId: skillId,
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
      status: SandboxStatusEnum.running,
      type: SandboxTypeEnum.editDebug
    });

    if (!sandboxInfo || sandboxInfo.status !== SandboxStatusEnum.running) {
      return jsonRes(res, { code: 404, error: 'Edit sandbox not found or not running' });
    }

    const runtimeProfile = getSandboxRuntimeProfile(providerConfig.provider);
    zipBuffer = await packageSkillInSandbox({
      sandboxId: sandboxInfo.sandboxId,
      workDirectory: runtimeProfile.workDirectory
    });
  } else {
    const currentVersion = await MongoAgentSkillsVersion.findOne({
      _id: skill.currentVersionId,
      skillId
    }).lean();
    if (!currentVersion?.storageKey) {
      return jsonRes(res, { code: 404, error: 'No current version available for download' });
    }

    zipBuffer = await downloadSkillPackage({ storageKey: currentVersion.storageKey });
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
