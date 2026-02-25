import type { UserInputFileItemType } from '../ChatContainer/ChatBox/type';

export type onSendMessageParamsType = {
  query?: string;
  collectionFormData?: string;
  files?: UserInputFileItemType[];
};
export type onSendMessageFnType = (e: onSendMessageParamsType) => Promise<any>;
