import { ErrType } from '../errorCode';

/* dataset: 504000 */
export enum ChatErrEnum {
  unAuthChat = 'unAuthChat'
}
const errList = [
  {
    statusText: ChatErrEnum.unAuthChat,
    message: '无权操作该对话记录'
  }
];
export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 504000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${ChatErrEnum}`>);
