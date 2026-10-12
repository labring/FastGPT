import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updateSkill, updateParentFoldersUpdateTime } from '@fastgpt/service/core/ai/skill/manage';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  AgentSkillCategoryEnum,
  AgentSkillCreationStatusEnum
} from '@fastgpt/global/core/ai/skill/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import {
  UpdateSkillBodySchema,
  type UpdateSkillBody
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { moveSkill } from '@/service/core/ai/skill/move';

/**
 * 更新技能接口
 * 1. 若包含 parentId，则复用 moveSkill 服务完成鉴权、层级检查、权限继承与移动操作；
 * 2. 若包含基础信息（名称、介绍、分类、头像），则校验写权限并更新。
 */
async function handler(req: ApiRequestProps<UpdateSkillBody>) {
  const { skillId, name, description, category, avatar, parentId } = parseApiInput({
    req,
    bodySchema: UpdateSkillBodySchema
  }).body;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  // 1. 移动分支：直接调用 moveSkill 统一服务
  if (parentId !== undefined) {
    await moveSkill({ req, skillId, parentId });
  }

  const hasUpdateFields =
    name !== undefined ||
    description !== undefined ||
    category !== undefined ||
    avatar !== undefined;

  // 纯移动操作，无需执行后续属性更新
  if (!hasUpdateFields) {
    return;
  }

  // 2. 基础属性更新
  const { teamId, tmbId, skill, permission } = await authSkill({
    req,
    skillId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  if (skill.creationStatus && skill.creationStatus !== AgentSkillCreationStatusEnum.ready) {
    return Promise.reject(skill.creationError || SkillErrEnum.noStorage);
  }

  if (!permission.hasWritePer) {
    return Promise.reject(SkillErrEnum.unAuthSkill);
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 50) {
      return Promise.reject(SkillErrEnum.invalidSkillName);
    }
  }

  if (description !== undefined && description.length > 500) {
    return Promise.reject(SkillErrEnum.invalidDescription);
  }

  if (category !== undefined) {
    const validCategories = Object.values(AgentSkillCategoryEnum) as string[];
    if (category.some((c) => !validCategories.includes(c))) {
      return Promise.reject(SkillErrEnum.invalidCategory);
    }
  }

  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description.trim();
  if (category !== undefined) updateData.category = category;
  if (avatar !== undefined) updateData.avatar = avatar;

  await mongoSessionRun(async (session) => {
    await updateSkill(skillId, updateData, session);
    await getS3AvatarSource().refreshAvatar(avatar, skill.avatar, session);
  });

  updateParentFoldersUpdateTime({ parentId: skill.parentId ?? null });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_SKILL,
      params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
    });
  })();
}

export default NextAPI(handler);
