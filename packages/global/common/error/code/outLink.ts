import { type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
/* dataset: 505000 */
export enum OutLinkErrEnum {
  unExist = 'outlinkUnExist',
  unAuthLink = 'unAuthLink',
  linkUnInvalid = 'linkUnInvalid',
  unAuthUser = 'unAuthUser',
  cannotHideBrand = 'outlinkCannotHideBrand'
}

const errList = [
  {
    statusText: OutLinkErrEnum.unExist,
    message: i18nT('common:code_error.outlink_error.link_not_exist')
  },
  {
    statusText: OutLinkErrEnum.unAuthLink,
    message: i18nT('common:code_error.outlink_error.invalid_link')
  },
  {
    code: 501,
    statusText: OutLinkErrEnum.linkUnInvalid,
    message: i18nT('common:code_error.outlink_error.invalid_link') // 使用相同的错误消息
  },
  {
    statusText: OutLinkErrEnum.unAuthUser,
    message: i18nT('common:code_error.outlink_error.un_auth_user')
  },
  {
    statusText: OutLinkErrEnum.cannotHideBrand,
    message: i18nT('common:share_brand_requires_plan')
  }
];

export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: cur?.code || 505000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${OutLinkErrEnum}`>);
