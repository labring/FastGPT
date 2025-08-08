import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

export const processAssignPermissionSpecific = (metadata: any) => {
  const role = parseInt(metadata.permission, 10);
  const permission = new TeamPermission({ role });

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
