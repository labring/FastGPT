import type { ApiRequestProps } from '@fastgpt/next/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/ai/skill/manage';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { checkMoveFolderDepth } from '@fastgpt/service/common/parentFolder/depth';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const logSkillMove = ({
  tmbId,
  teamId,
  skill,
  targetFolderName
}: {
  tmbId: string;
  teamId: string;
  skill: any;
  targetFolderName: string;
}) => {
  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.MOVE_SKILL,
    params: {
      skillName: skill.name,
      skillType: getI18nSkillType(skill.type),
      targetFolderName
    }
  });
};

/** 移动单个技能或文件夹，处理深度、权限继承与更新时间更新。 */
export const moveSkill = async ({
  req,
  skillId,
  parentId
}: {
  req: ApiRequestProps;
  skillId: string;
  parentId: ParentIdType;
}) => {
  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  if (skill.creationStatus && skill.creationStatus !== AgentSkillCreationStatusEnum.ready) {
    return Promise.reject(skill.creationError || 'Skill is not ready');
  }
  if (parentId) {
    await authSkill({
      req,
      skillId: parentId,
      per: ManagePermissionVal,
      authToken: true,
      authApiKey: true
    });
  }
  if (skill.parentId) {
    await authSkill({
      req,
      skillId: String(skill.parentId),
      per: ManagePermissionVal,
      authToken: true,
      authApiKey: true
    });
  }
  if (parentId === null || !skill.parentId) {
    await authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: TeamSkillCreatePermissionVal
    });
  }
  await checkMoveFolderDepth({
    resourceId: skillId,
    targetParentId: parentId,
    teamId,
    model: MongoAgentSkills,
    isFolderType: (type) => type === AgentSkillTypeEnum.folder
  });

  let targetFolderName = 'root';
  if (parentId) {
    const targetFolder = await MongoAgentSkills.findById(parentId, 'name').lean();
    if (targetFolder) targetFolderName = targetFolder.name;
  }

  await mongoSessionRun(async (session) => {
    const [parentClbs, oldParentClbs, oldResourceClbs] = await Promise.all([
      getResourceOwnedClbs({
        teamId,
        resourceId: parentId,
        resourceType: PerResourceTypeEnum.agentSkill,
        session
      }),
      skill.parentId
        ? getResourceOwnedClbs({
            teamId,
            resourceId: skill.parentId,
            resourceType: PerResourceTypeEnum.agentSkill,
            session
          })
        : Promise.resolve([]),
      getResourceOwnedClbs({
        teamId,
        resourceId: skillId,
        resourceType: PerResourceTypeEnum.agentSkill,
        session
      })
    ]);
    const newResourceClbs = await syncCollaborators({
      resourceId: skillId,
      resourceType: PerResourceTypeEnum.agentSkill,
      collaborators: parentClbs,
      oldParentCollaborators: oldParentClbs,
      session,
      teamId
    });
    await syncChildrenPermission({
      resource: skill,
      resourceType: PerResourceTypeEnum.agentSkill,
      resourceModel: MongoAgentSkills,
      folderTypeList: [AgentSkillTypeEnum.folder],
      oldParentCollaborators: oldResourceClbs,
      newParentCollaborators: newResourceClbs,
      session
    });
    await MongoAgentSkills.findByIdAndUpdate(
      skillId,
      {
        ...parseParentIdInMongo(parentId),
        inheritPermission: true,
        updateTime: new Date()
      },
      { session }
    );
  });

  updateParentFoldersUpdateTime({ parentId: skill.parentId ?? null });
  updateParentFoldersUpdateTime({ parentId });

  logSkillMove({ tmbId, teamId, skill, targetFolderName });
};
