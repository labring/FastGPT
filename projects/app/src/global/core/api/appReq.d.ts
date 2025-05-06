import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { PaginationProps } from '@fastgpt/web/common/fetch/type';

export type GetAppChatLogsProps = {
  appId: string;
  dateStart: Date;
  dateEnd: Date;
  sources?: ChatSourceEnum[];
  logTitle?: string;
};

export type GetAppChatLogsParams = PaginationProps<GetAppChatLogsProps>;
