import { MongoAgentSkills } from '../../../core/agentSkills/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkills/type';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { SkillPermission } from '@fastgpt/global/support/permission/agentSkill/controller';
import { ReadPermissionVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import type { AuthModeType, AuthResponseType } from '../type';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { parseHeaderCert } from '../auth/common';

export type AuthSkillResponse = AuthResponseType<SkillPermission> & {
  skill: AgentSkillSchemaType & { permission: SkillPermission };
};

/**
 * Verify skill access permission by tmbId (no request dependency, for internal use).
 *
 * Permission rules (mirrors authAppByTmbId):
 * - System skills: read-only for all team members; write/manage are rejected
 * - Team owner or skill creator: owner-level access (read + write + manage)
 * - Other team members: no default access (NullRoleVal)
 */
export const authSkillByTmbId = async ({
  tmbId,
  skillId,
  per,
  isRoot
}: {
  tmbId: string;
  skillId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{
  skill: AgentSkillSchemaType & { permission: SkillPermission };
}> => {
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const skill = await (async () => {
    const skill = await MongoAgentSkills.findOne({ _id: skillId, deleteTime: null }).lean();

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

    // System skills are read-only for all team members (equivalent to AppTypeEnum.hidden)
    if (skill.source === AgentSkillSourceEnum.system) {
      if (per !== ReadPermissionVal) {
        return Promise.reject(SkillErrEnum.unAuthSkill);
      }
      return {
        ...skill,
        permission: new SkillPermission({ isOwner: false, role: ReadRoleVal })
      };
    }

    // Team owner or skill creator gets full (owner-level) permission; others get NullRoleVal
    const isOwner = tmbPer.isOwner || String(skill.tmbId) === String(tmbId);
    const Per = new SkillPermission({ isOwner });

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
