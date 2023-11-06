import { ErrType } from '../errorCode';

/* dataset: 502000 */
export enum AppErrEnum {
  unAuthApp = 'unAuthApp'
}
const appErrList = [
  {
    statusText: AppErrEnum.unAuthApp,
    message: '无权操作该应用'
  }
];
export const appErrMap = appErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 502000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${AppErrEnum}`>);
