import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { defaultMetadataProcessor } from './commonProcessor';

/** 保留应用类型等通用翻译，并将协作者角色转换为权限标记。 */
export const processUpdateAppCollaboratorSpecific = (metadata: any, t: (key: string) => string) => {
  const formattedMetadata = defaultMetadataProcessor(metadata, t);
  const role = parseInt(metadata.permission, 10);
  const permission = new AppPermission({ role });
  return {
    ...formattedMetadata,
    readPermission: permission.hasReadPer ? '✔' : '✘',
    writePermission: permission.hasWritePer ? '✔' : '✘',
    managePermission: permission.hasManagePer ? '✔' : '✘'
  };
};

export const createAppProcessors = {
  UPDATE_APP_COLLABORATOR: processUpdateAppCollaboratorSpecific
};
