import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { defaultMetadataProcessor } from './commonProcessor';

// TODO: replace any
/** 保留通用翻译，并将团队角色转换为审计文案中的各项权限标记。 */
export const processAssignPermissionSpecific = (metadata: any, t: (key: string) => string) => {
  const formattedMetadata = defaultMetadataProcessor(metadata, t);
  // metadata.permission is a string, parseInt will convert it to number in decimal
  const role = parseInt(metadata.permission, 10);
  const permission = new TeamPermission({ role });

  return {
    ...formattedMetadata,
    appCreate: permission.hasAppCreatePer ? '✔' : '✘',
    datasetCreate: permission.hasDatasetCreatePer ? '✔' : '✘',
    apiKeyCreate: permission.hasApikeyCreatePer ? '✔' : '✘',
    modelCreate: permission.hasModelCreatePer ? '✔' : '✘',
    manage: permission.hasManagePer ? '✔' : '✘'
  };
};

export const createTeamProcessors = {
  ASSIGN_PERMISSION: processAssignPermissionSpecific
};
