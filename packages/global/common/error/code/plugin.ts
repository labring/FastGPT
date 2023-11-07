import { ErrType } from '../errorCode';

/* dataset: 507000 */
export enum PluginErrEnum {
  unExist = 'unExist',
  unAuth = 'unAuth'
}
const errList = [
  {
    statusText: PluginErrEnum.unExist,
    message: '插件不存在'
  },
  {
    statusText: PluginErrEnum.unAuth,
    message: '无权操作该插件'
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
}, {} as ErrType<`${PluginErrEnum}`>);
