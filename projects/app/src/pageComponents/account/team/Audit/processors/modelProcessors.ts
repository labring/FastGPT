import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';

// Render the hardcoded read-only collaborator permission as readable checkmarks
// in the audit log (design §6.2: UPDATE_MODEL_COLLABORATOR carries `permission`).
export const processUpdateModelCollaboratorSpecific = (metadata: any) => {
  const role = parseInt(metadata.permission, 10);
  const permission = new ModelPermission({ role });
  return {
    ...metadata,
    readPermission: permission.hasReadPer ? '✔' : '✘',
    writePermission: permission.hasWritePer ? '✔' : '✘',
    managePermission: permission.hasManagePer ? '✔' : '✘'
  };
};

export const createModelProcessors = {
  UPDATE_MODEL_COLLABORATOR: processUpdateModelCollaboratorSpecific
};
