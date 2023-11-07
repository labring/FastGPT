import { ErrType } from '../errorCode';

/* dataset: 502000 */
export enum AppErrEnum {
  unExist = 'unExist',
  unAuthApp = 'unAuthApp'
}
const appErrList = [
  {
    statusText: AppErrEnum.unExist,
    message: '应用不存在'
  },
  {
    statusText: AppErrEnum.unAuthApp,
    message: '无权操作该应用'
  }
];
export default appErrList.reduce((acc, cur, index) => {
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
