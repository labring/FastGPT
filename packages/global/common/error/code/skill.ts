import { i18nT } from '../../i18n/utils';
import { type ErrType } from '../errorCode';

/* skill: 511000 */
export enum SkillErrEnum {
  exportMissingAppId = 'skillExportMissingAppId',
  exportMissingSkillParams = 'skillExportMissingSkillParams',
  exportInvalidSkillName = 'skillExportInvalidSkillName',
  exportSkillNameTooLong = 'skillExportSkillNameTooLong',
  exportSkillDescriptionTooLong = 'skillExportSkillDescriptionTooLong',
  exportFailed = 'skillExportFailed',
  archiveError = 'skillArchiveError'
}

const skillErr = [
  {
    statusText: SkillErrEnum.exportMissingAppId,
    message: i18nT('skill:missing_app_id')
  },
  {
    statusText: SkillErrEnum.exportMissingSkillParams,
    message: i18nT('skill:missing_skill_params')
  },
  {
    statusText: SkillErrEnum.exportInvalidSkillName,
    message: i18nT('skill:invalid_skill_name')
  },
  {
    statusText: SkillErrEnum.exportSkillNameTooLong,
    message: i18nT('skill:skill_name_too_long')
  },
  {
    statusText: SkillErrEnum.exportSkillDescriptionTooLong,
    message: i18nT('skill:skill_description_too_long')
  },
  {
    statusText: SkillErrEnum.exportFailed,
    message: i18nT('skill:export_failed')
  },
  {
    statusText: SkillErrEnum.archiveError,
    message: i18nT('skill:archive_error')
  }
];

export default skillErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 511000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${SkillErrEnum}`>);
