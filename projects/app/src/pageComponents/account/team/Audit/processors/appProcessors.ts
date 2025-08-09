import { AppPermission } from '@fastgpt/global/support/permission/app/controller';

export const processUpdateAppCollaboratorSpecific = (metadata: any) => {
  const role = parseInt(metadata.permission, 10);
  const permission = new AppPermission({ role });
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
