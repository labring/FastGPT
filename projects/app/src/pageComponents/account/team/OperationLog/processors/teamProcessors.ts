// Team processors
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

export const processAssignPermissionMetadata = (metadata: {
  name?: string;
  objectName: string;
  permission: string;
}) => {
  const permissionValue = parseInt(metadata.permission, 10);
  const permission = new TeamPermission({ per: permissionValue });

  return {
    ...metadata,
    appCreate: permission.hasAppCreatePer ? '✔' : '✘',
    datasetCreate: permission.hasDatasetCreatePer ? '✔' : '✘',
    apiKeyCreate: permission.hasApikeyCreatePer ? '✔' : '✘',
    manage: permission.hasManagePer ? '✔' : '✘'
  };
};

export const createBasicTeamProcessor = () => (metadata: any) => metadata;

export const teamProcessors = {
  LOGIN: createBasicTeamProcessor(),
  CREATE_INVITATION_LINK: createBasicTeamProcessor(),
  JOIN_TEAM: createBasicTeamProcessor(),
  CHANGE_MEMBER_NAME: createBasicTeamProcessor(),
  KICK_OUT_TEAM: createBasicTeamProcessor(),
  RECOVER_TEAM_MEMBER: createBasicTeamProcessor(),
  CREATE_DEPARTMENT: createBasicTeamProcessor(),
  CHANGE_DEPARTMENT: createBasicTeamProcessor(),
  DELETE_DEPARTMENT: createBasicTeamProcessor(),
  RELOCATE_DEPARTMENT: createBasicTeamProcessor(),
  CREATE_GROUP: createBasicTeamProcessor(),
  DELETE_GROUP: createBasicTeamProcessor(),
  ASSIGN_PERMISSION: processAssignPermissionMetadata
};
