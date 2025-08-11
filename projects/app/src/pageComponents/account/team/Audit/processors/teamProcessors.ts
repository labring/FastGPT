import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

// TODO: replace any
export const processAssignPermissionSpecific = (metadata: any) => {
  // metadata.permission is a string, parseInt will convert it to number in decimal
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
