import { AppPermission } from '@fastgpt/global/support/permission/app/controller';

export const processUpdateAppCollaboratorSpecific = (metadata: any) => {
  const permissionValue = parseInt(metadata.permission, 10);
  const permission = new AppPermission({ per: permissionValue });
  return {
    ...metadata,
    readPermission: permission.hasReadPer ? '✔' : '✘',
    writePermission: permission.hasWritePer ? '✔' : '✘',
    managePermission: permission.hasManagePer ? '✔' : '✘'
  };
};

export const createAppProcessors = {
  UPDATE_APP_COLLABORATOR: processUpdateAppCollaboratorSpecific
};
