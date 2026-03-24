import { type ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* agentSkill: 509000 */
export enum SkillErrEnum {
  unExist = 'skillUnExist',
  unAuthSkill = 'unAuthSkill',
  canNotEditAdminPermission = 'canNotEditAdminPermission'
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
