import { RequestPaging } from '@/types';

export type GetAppChatLogsParams = RequestPaging & {
  appId: string;
  dateStart: Date;
  dateEnd: Date;
};
