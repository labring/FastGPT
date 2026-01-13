import { type ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* dataset: 504000 */
export enum ChatErrEnum {
  unAuthChat = 'unAuthChat',
  modelNameRequired = 'modelNameRequired'
}
const errList = [
  {
    statusText: ChatErrEnum.unAuthChat,
    message: i18nT('common:code_error.chat_error.un_auth')
  },
  {
    statusText: ChatErrEnum.modelNameRequired,
    message: i18nT('common:code_error.chat_error.model_name_required')
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

