import { type ErrorHttpStatus, type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
/* agentSkill: 509000 */
export enum SkillErrEnum {
  unExist = 'skillUnExist',
  unAuthSkill = 'unAuthSkill',
  canNotEditAdminPermission = 'canNotEditAdminPermission',
  invalidSkillName = 'invalidSkillName',
  invalidDescription = 'invalidDescription',
  invalidCategory = 'invalidCategory',
  invalidConfig = 'invalidConfig',
  noStorage = 'noStorage',
  noFieldsToUpdate = 'noFieldsToUpdate',
  invalidArchiveFormat = 'invalidArchiveFormat',
  invalidSkillPackage = 'invalidSkillPackage',
  invalidSkillId = 'invalidSkillId',
  archiveEmpty = 'archiveEmpty',
  archiveExtractionFailed = 'archiveExtractionFailed',
  archiveTooLarge = 'archiveTooLarge',
  missingImageRepository = 'missingImageRepository',
  skillNameTooLong = 'skillNameTooLong',
  missingSkillMd = 'missingSkillMd',
  noValidSkillMd = 'noValidSkillMd',
  archiveSymlinkNotAllowed = 'archiveSymlinkNotAllowed',
  editSandboxNotRunning = 'editSandboxNotRunning',
  deployFailed = 'skillDeployFailed'
}
const skillErrList: Array<{
  statusText: SkillErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: SkillErrEnum.unExist,
    message: i18nT('common:code_error.skill_error.not_exist'),
    httpStatus: 404
  },
  {
    statusText: SkillErrEnum.unAuthSkill,
    message: i18nT('common:code_error.skill_error.un_auth_skill'),
    httpStatus: 403
  },
  {
    statusText: SkillErrEnum.canNotEditAdminPermission,
    message: i18nT('common:code_error.skill_error.can_not_edit_admin_permission'),
    httpStatus: 403
  },
  {
    statusText: SkillErrEnum.invalidSkillName,
    message: i18nT('common:code_error.skill_error.invalid_name'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.invalidDescription,
    message: i18nT('common:code_error.skill_error.invalid_description'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.invalidCategory,
    message: i18nT('common:code_error.skill_error.invalid_category'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.invalidConfig,
    message: i18nT('common:code_error.skill_error.invalid_config'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.noStorage,
    message: i18nT('common:code_error.skill_error.no_storage'),
    httpStatus: 422
  },
  {
    statusText: SkillErrEnum.noFieldsToUpdate,
    message: i18nT('common:code_error.skill_error.no_fields_to_update'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.invalidArchiveFormat,
    message: i18nT('common:code_error.skill_error.invalid_archive_format'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.invalidSkillPackage,
    message: i18nT('common:code_error.skill_error.invalid_package'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.invalidSkillId,
    message: i18nT('common:code_error.skill_error.invalid_skill_id'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.archiveEmpty,
    message: i18nT('common:code_error.skill_error.archive_empty'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.archiveExtractionFailed,
    message: i18nT('common:code_error.skill_error.archive_extraction_failed'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.archiveTooLarge,
    message: i18nT('common:code_error.skill_error.archive_too_large'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.missingImageRepository,
    message: i18nT('common:code_error.skill_error.missing_image_repository'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.skillNameTooLong,
    message: i18nT('common:code_error.skill_error.skill_name_too_long'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.missingSkillMd,
    message: i18nT('common:code_error.skill_error.missing_skill_md'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.noValidSkillMd,
    message: i18nT('common:code_error.skill_error.no_valid_skill_md'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.archiveSymlinkNotAllowed,
    message: i18nT('common:code_error.skill_error.archive_symlink_not_allowed'),
    httpStatus: 400
  },
  {
    statusText: SkillErrEnum.editSandboxNotRunning,
    message: i18nT('common:code_error.skill_error.edit_sandbox_not_running'),
    httpStatus: 404
  },
  {
    statusText: SkillErrEnum.deployFailed,
    message: i18nT('skill:deploy_failed'),
    httpStatus: 500
  }
];
export default skillErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 509000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${SkillErrEnum}`>);
