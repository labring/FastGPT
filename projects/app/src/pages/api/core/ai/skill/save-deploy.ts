import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { saveDeploySkillFromSandbox } from '@fastgpt/service/core/ai/skill/edit/deploy';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  SaveDeploySkillBodySchema,
  SaveDeploySkillResponseSchema,
  type SaveDeploySkillBody,
  type SaveDeploySkillResponse
} from '@fastgpt/global/core/ai/skill/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

/**
 * 从编辑态 sandbox 保存并发布 skill。
 *
 * API 层只保留请求校验、权限校验、创建状态校验和审计日志；实际打包、解析、
 * 上传对象存储和版本切换逻辑收敛到 service/core/ai/skill/edit/deploy。
 */
async function handler(
  req: ApiRequestProps<SaveDeploySkillBody>
): Promise<SaveDeploySkillResponse> {
  const { skillId, versionName } = parseApiInput({
    req,
    bodySchema: SaveDeploySkillBodySchema
  }).body;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  // 发布会写入新版本，因此这里需要 skill 写权限。
  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: WritePermissionVal,
    authToken: true,
    authApiKey: true
  });

  if (skill.creationStatus && skill.creationStatus !== AgentSkillCreationStatusEnum.ready) {
    return Promise.reject(skill.creationError || SkillErrEnum.noStorage);
  }

  const response = await saveDeploySkillFromSandbox({
    skillId,
    teamId,
    tmbId,
    versionName
  });

  // 审计日志不影响发布结果，异步写入即可。
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DEPLOY_SKILL,
      params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
    });
  })();

  return SaveDeploySkillResponseSchema.parse(response);
}

export default NextAPI(handler);
