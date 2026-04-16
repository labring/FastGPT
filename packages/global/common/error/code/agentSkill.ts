import { type ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* agentSkill: 509000 */
export enum SkillErrEnum {
  unExist = 'skillUnExist',
  unAuthSkill = 'unAuthSkill',
  canNotEditAdminPermission = 'canNotEditAdminPermission',
  skillNameExists = 'skillNameExists',
  invalidSkillName = 'invalidSkillName',
  invalidDescription = 'invalidDescription',
  invalidCategory = 'invalidCategory',
  invalidConfig = 'invalidConfig',
  missingModel = 'missingModel',
  requirementsTooLong = 'requirementsTooLong',
  noStorage = 'noStorage',
  noFieldsToUpdate = 'noFieldsToUpdate',
  invalidArchiveFormat = 'invalidArchiveFormat',
  invalidSkillPackage = 'invalidSkillPackage'
}
const skillErrList = [
  {
    statusText: SkillErrEnum.unExist,
    message: i18nT('common:code_error.skill_error.not_exist')
  },
  {
    statusText: SkillErrEnum.unAuthSkill,
    message: i18nT('common:code_error.skill_error.un_auth_skill')
  },
  {
    statusText: SkillErrEnum.canNotEditAdminPermission,
    message: i18nT('common:code_error.skill_error.can_not_edit_admin_permission')
  },
  {
    statusText: SkillErrEnum.skillNameExists,
    message: i18nT('common:code_error.skill_error.name_exists')
  },
  {
    statusText: SkillErrEnum.invalidSkillName,
    message: i18nT('common:code_error.skill_error.invalid_name')
  },
  {
    statusText: SkillErrEnum.invalidDescription,
    message: i18nT('common:code_error.skill_error.invalid_description')
  },
  {
    statusText: SkillErrEnum.invalidCategory,
    message: i18nT('common:code_error.skill_error.invalid_category')
  },
  {
    statusText: SkillErrEnum.invalidConfig,
    message: i18nT('common:code_error.skill_error.invalid_config')
  },
  {
    statusText: SkillErrEnum.missingModel,
    message: i18nT('common:code_error.skill_error.missing_model')
  },
  {
    statusText: SkillErrEnum.requirementsTooLong,
    message: i18nT('common:code_error.skill_error.requirements_too_long')
  },
  {
    statusText: SkillErrEnum.noStorage,
    message: i18nT('common:code_error.skill_error.no_storage')
  },
  {
    statusText: SkillErrEnum.noFieldsToUpdate,
    message: i18nT('common:code_error.skill_error.no_fields_to_update')
  },
  {
    statusText: SkillErrEnum.invalidArchiveFormat,
    message: i18nT('common:code_error.skill_error.invalid_archive_format')
  },
  {
    statusText: SkillErrEnum.invalidSkillPackage,
    message: i18nT('common:code_error.skill_error.invalid_package')
  }
];
export default skillErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 509000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${SkillErrEnum}`>);
