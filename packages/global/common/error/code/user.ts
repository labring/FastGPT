import { ErrType } from '../errorCode';

/* team: 503000 */
export enum UserErrEnum {
  binVisitor = 'binVisitor'
}
const teamErr = [{ statusText: UserErrEnum.binVisitor, message: '您当前身份为游客，无权操作' }];
export const TeamErrorMap = teamErr.reduce((acc, cur, index) => {
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
