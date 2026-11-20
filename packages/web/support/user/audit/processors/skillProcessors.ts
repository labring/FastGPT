import { SkillPermission } from '@fastgpt/global/support/permission/skill/controller';
import { defaultMetadataProcessor } from './commonProcessor';

/** 保留技能类型等通用翻译，并将技能协作者角色转换为权限标记。 */
export const processUpdateSkillCollaboratorSpecific = (
  metadata: any,
  t: (key: string) => string
) => {
  const formattedMetadata = defaultMetadataProcessor(metadata, t);
  const role = parseInt(metadata.permission, 10);
  if (!Number.isFinite(role)) {
    return formattedMetadata;
  }
  const permission = new SkillPermission({ role });
  return {
    ...formattedMetadata,
    readPermission: permission.hasReadPer ? '✔' : '✘',
    writePermission: permission.hasWritePer ? '✔' : '✘',
    managePermission: permission.hasManagePer ? '✔' : '✘'
  };
};

export const createSkillProcessors = {
  UPDATE_SKILL_COLLABORATOR: processUpdateSkillCollaboratorSpecific
};
