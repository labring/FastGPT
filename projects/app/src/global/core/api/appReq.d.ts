import { PaginationProps } from '@fastgpt/web/common/fetch/type';

export type GetAppChatLogsParams = PaginationProps<{
  appId: string;
  dateStart: Date;
  dateEnd: Date;
}>;
