import { ErrType } from '../errorCode';

/* team: 503000 */
export enum UserErrEnum {
  unAuthUser = 'unAuthUser',
  unAuthRole = 'unAuthRole',
  binVisitor = 'binVisitor',
  balanceNotEnough = 'balanceNotEnough',
  aiPointsNotEnough = 'aiPointsNotEnough'
}
const errList = [
  { statusText: UserErrEnum.unAuthUser, message: '找不到该用户' },
  { statusText: UserErrEnum.binVisitor, message: '您的身份校验未通过' },
  { statusText: UserErrEnum.binVisitor, message: '您当前身份为游客，无权操作' },
  { statusText: UserErrEnum.balanceNotEnough, message: '账号余额不足~' },
  { statusText: UserErrEnum.aiPointsNotEnough, message: 'AI积分已用完~' }
];
export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 503000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${UserErrEnum}`>);
