import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { importSkill, updateParentFoldersUpdateTime } from '@fastgpt/service/core/ai/skill/manage';
import {
  ImportSkillQuerySchema,
  ImportSkillResponseSchema,
  type ImportSkillQuery,
  type ImportSkillResponse
} from '@fastgpt/global/core/ai/skill/api';
import {
  AgentSkillCategoryEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getAgentSandboxSkillMaxBytes } from '@fastgpt/service/core/ai/sandbox/interface/config';

export const config = {
  api: {
    bodyParser: false
  }
};

async function handler(
  req: ApiRequestProps<unknown, ImportSkillQuery>
): Promise<ImportSkillResponse> {
  const query = parseApiInput({ req, querySchema: ImportSkillQuerySchema }).query;
  const filename = query.filename.split(/[\\/]/).pop() ?? query.filename;

  if (!filename.toLowerCase().endsWith('.zip')) {
    return Promise.reject(SkillErrEnum.invalidArchiveFormat);
  }

  const maxSkillPackageSize = getAgentSandboxSkillMaxBytes();
  const contentLengthHeader = req.headers['content-length'];
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;

  if (contentLength !== undefined && contentLength > maxSkillPackageSize) {
    return Promise.reject(SkillErrEnum.archiveTooLarge);
  }

  // 在消费文件流前完成权限校验，避免未授权请求占用对象存储上传带宽。
  const { teamId, tmbId } = query.parentId
    ? await authSkill({
        req,
        authToken: true,
        authApiKey: true,
        skillId: query.parentId,
        per: WritePermissionVal
      })
    : await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamSkillCreatePermissionVal
      });

  const skillName = query.name?.trim() || filename.replace(/\.[^.]+$/, '').trim() || 'package';

  const skillId = await importSkill({
    skill: {
      name: skillName,
      description: query.description?.trim() ?? '',
      category: [AgentSkillCategoryEnum.other],
      avatar: query.avatar
    },
    teamId,
    tmbId,
    packageStream: req,
    contentLength,
    parentId: query.parentId ?? null
  });

  updateParentFoldersUpdateTime({ parentId: query.parentId });

  void addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.IMPORT_SKILL,
    params: {
      skillName,
      skillType: getI18nSkillType(AgentSkillTypeEnum.skill)
    }
  });

  return ImportSkillResponseSchema.parse(skillId);
}

export default NextAPI(handler);
