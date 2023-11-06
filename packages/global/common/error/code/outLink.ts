import { ErrType } from '../errorCode';

/* dataset: 505000 */
export enum OutLinkErrEnum {
  unAuthLink = 'unAuthLink'
}
const errList = [
  {
    statusText: OutLinkErrEnum.unAuthLink,
    message: '分享链接无效'
  }
];
export const appErrMap = errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 505000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${OutLinkErrEnum}`>);
