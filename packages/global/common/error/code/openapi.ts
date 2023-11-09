import { ErrType } from '../errorCode';

/* dataset: 506000 */
export enum OpenApiErrEnum {
  unExist = 'unExist',
  unAuth = 'unAuth'
}
const errList = [
  {
    statusText: OpenApiErrEnum.unExist,
    message: 'Api Key 不存在'
  },
  {
    statusText: OpenApiErrEnum.unAuth,
    message: '无权操作该 Api Key'
  }
];
export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 506000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${OpenApiErrEnum}`>);
