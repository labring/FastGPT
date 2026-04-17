import { MongoAgentSkills } from '../../../core/agentSkills/schema';
import {
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkills/type';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { SkillPermission } from '@fastgpt/global/support/permission/agentSkill/controller';
import {
  NullRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import type { AuthModeType, AuthResponseType } from '../type';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { parseHeaderCert } from '../auth/common';
import { getTmbPermission } from '../controller';
import { sumPer } from '@fastgpt/global/support/permission/utils';

export type AuthSkillResponse = AuthResponseType<SkillPermission> & {
  skill: AgentSkillSchemaType & { permission: SkillPermission };
};

/**
 * Verify skill access permission by tmbId (no request dependency, for internal use).
 *
 * Permission rules:
 * - System skills: read-only for all team members; write/manage are rejected
 * - Team owner or skill creator: owner-level access
 * - Other team members: permission from ResourcePermission table (supports inheritance)
 */
export const authSkillByTmbId = async ({
  tmbId,
  skillId,
  per,
  isRoot = false
}: {
  tmbId: string;
  skillId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{
  skill: AgentSkillSchemaType & { permission: SkillPermission };
}> => {
  const skill = await (async () => {
    const [{ teamId, permission: tmbPer }, skill] = await Promise.all([
      getTmbInfoByTmbId({ tmbId }),
      MongoAgentSkills.findOne({ _id: skillId, deleteTime: null }).lean()
    ]);

    if (!skill) {
      return Promise.reject(SkillErrEnum.unExist);
    }

    if (isRoot) {
      return {
        ...skill,
        permission: new SkillPermission({ isOwner: true })
      };
    }

    if (String(skill.teamId) !== teamId) {
      return Promise.reject(SkillErrEnum.unAuthSkill);
    }

    // System skills are read-only for all team members
    if (skill.source === AgentSkillSourceEnum.system) {
      const sysPer = new SkillPermission({ role: ReadRoleVal, isOwner: false });
      if (!sysPer.checkPer(per)) {
        return Promise.reject(SkillErrEnum.unAuthSkill);
      }
      return {
        ...skill,
        permission: sysPer
      };
    }

    // Check if should inherit permission from parent folder
    const isOwner = tmbPer.isOwner || String(skill.tmbId) === String(tmbId);
    const isGetParentClb =
      skill.inheritPermission !== false &&
      skill.type !== AgentSkillTypeEnum.folder &&
      !!skill.parentId;

    // Get parent folder permission and self permission in parallel
    const [folderPer = NullRoleVal, myPer = NullRoleVal] = await Promise.all([
      isGetParentClb
        ? getTmbPermission({
            teamId,
            tmbId,
            resourceId: skill.parentId!,
            resourceType: PerResourceTypeEnum.agentSkill
          })
        : NullRoleVal,
      getTmbPermission({
        teamId,
        tmbId,
        resourceId: skillId,
        resourceType: PerResourceTypeEnum.agentSkill
      })
    ]);

    // Merge folder permission and self permission
    const Per = new SkillPermission({ role: sumPer(folderPer, myPer), isOwner });

    if (!Per.checkPer(per)) {
      return Promise.reject(SkillErrEnum.unAuthSkill);
    }

    return {
      ...skill,
      permission: Per
    };
  })();

  return { skill };
};

/**
 * Verify skill access permission from an HTTP request (for API route use).
 */
export const authSkill = async ({
  skillId,
  per,
  ...props
}: AuthModeType & {
  skillId: string;
  per: PermissionValueType;
}): Promise<AuthSkillResponse> => {
  const result = await parseHeaderCert(props);
  const { tmbId } = result;

  if (!skillId) {
    return Promise.reject(SkillErrEnum.unExist);
  }

  const { skill } = await authSkillByTmbId({
    tmbId,
    skillId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: skill.permission,
    skill
  };
};
