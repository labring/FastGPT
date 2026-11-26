import { type ErrorHttpStatus, type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
import { MODERATION_BLOCKED_ERROR_MESSAGE } from '../../../core/plugin/moderation/constants';
/* dataset: 504000 */
export enum ChatErrEnum {
  unAuthChat = 'unAuthChat',
  chatIsGenerating = 'chatIsGenerating',
  chatEntryModerationBlocked = 'chatEntryModerationBlocked'
}
const errList: Array<{
  statusText: ChatErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: ChatErrEnum.unAuthChat,
    message: i18nT('common:code_error.chat_error.un_auth'),
    httpStatus: 403
  },
  {
    statusText: ChatErrEnum.chatIsGenerating,
    message: i18nT('common:code_error.chat_error.chat_generating'),
    httpStatus: 409
  },
  {
    statusText: ChatErrEnum.chatEntryModerationBlocked,
    message: MODERATION_BLOCKED_ERROR_MESSAGE,
    httpStatus: 400
  }
];
export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 504000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${ChatErrEnum}`>);
