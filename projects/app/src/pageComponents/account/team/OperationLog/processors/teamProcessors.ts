import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

export const processAssignPermissionSpecific = (metadata: any) => {
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

export const createTeamProcessors = {
  ASSIGN_PERMISSION: processAssignPermissionSpecific
};
