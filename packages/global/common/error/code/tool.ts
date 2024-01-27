import { ErrType } from '../errorCode';

/* dataset: 507000 */
export enum ToolErrEnum {
  unExist = 'unExist',
  unAuth = 'unAuth'
}
const errList = [
  {
    statusText: ToolErrEnum.unExist,
    message: '工具不存在'
  },
  {
    statusText: ToolErrEnum.unAuth,
    message: '无权操作该工具'
  }
];
export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 507000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${ToolErrEnum}`>);
