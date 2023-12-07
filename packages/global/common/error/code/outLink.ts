import { ErrType } from '../errorCode';

/* dataset: 505000 */
export enum OutLinkErrEnum {
  unExist = 'unExist',
  unAuthLink = 'unAuthLink',
  linkUnInvalid = 'linkUnInvalid',

  unAuthUser = 'unAuthUser'
}
const errList = [
  {
    statusText: OutLinkErrEnum.unExist,
    message: '分享链接不存在'
  },
  {
    statusText: OutLinkErrEnum.unAuthLink,
    message: '分享链接无效'
  },
  {
    code: 501,
    statusText: OutLinkErrEnum.linkUnInvalid,
    message: '分享链接无效'
  },
  {
    statusText: OutLinkErrEnum.unAuthUser,
    message: '身份校验失败'
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
