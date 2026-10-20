import {
  TeamApikeyCreateRoleVal,
  TeamAppCreateRoleVal,
  TeamDatasetCreateRoleVal,
  TeamSkillCreateRoleVal
} from '@fastgpt/global/support/permission/user/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/controller';
import { logInstanceConfigRead } from '../../../common/system/migrationCoverageLog';
import { serviceEnv } from '../../../env';
import type { ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { updateTeamCollaborator } from '../resourcePermissionService';
import { MongoMemberGroupModel } from './memberGroupSchema';

const defaultTeamBasicRole =
  TeamAppCreateRoleVal |
  TeamSkillCreateRoleVal |
  TeamDatasetCreateRoleVal |
  TeamApikeyCreateRoleVal;

/**
 * 创建团队默认全员组，并按环境配置初始化团队级基础权限。
 * 调用方传入 session 时复用现有事务，否则为组和权限写入开启独立事务。
 */
export async function createTeamDefaultGroup({
  teamId,
  avatar,
  session
}: {
  teamId: string;
  avatar?: string;
  session?: ClientSession;
}) {
  const create = async (activeSession: ClientSession) => {
    const [group] = await MongoMemberGroupModel.create(
      [
        {
          teamId,
          name: DefaultGroupName,
          avatar
        }
      ],
      { session: activeSession, ordered: true }
    );

    const configuredBasicPermissionsEnabled =
      getSystemInstanceConfig().auth.defaultTeamBasicPermissionsEnabled;
    const basicPermissionsEnabled =
      configuredBasicPermissionsEnabled ?? serviceEnv.DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED;
    logInstanceConfigRead({
      callsite: 'runtime.support.permission.teamDefaultGroup.createTeamDefaultGroup',
      source: configuredBasicPermissionsEnabled === undefined ? 'env-fallback' : 'instance-config',
      fields: [
        {
          path: 'auth.defaultTeamBasicPermissionsEnabled',
          value: configuredBasicPermissionsEnabled ?? basicPermissionsEnabled
        }
      ]
    });

    if (basicPermissionsEnabled) {
      await updateTeamCollaborator({
        teamId,
        collaborator: { groupId: String(group._id) },
        permission: defaultTeamBasicRole,
        session: activeSession
      });
    }

    return group;
  };

  return session ? create(session) : mongoSessionRun(create);
}
