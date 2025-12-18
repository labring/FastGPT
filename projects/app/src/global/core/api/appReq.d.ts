import type { ChatSourceEnum, FeedbackFilterEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { PaginationProps } from '@fastgpt/web/common/fetch/type';

export type GetAppChatLogsProps = {
  appId: string;
  dateStart: Date;
  dateEnd: Date;
  sources?: ChatSourceEnum[];
  tmbIds?: string[];
  chatSearch?: string;
  feedbackFilter?: FeedbackFilterEnum[];
};

export type GetAppChatLogsParams = PaginationProps<GetAppChatLogsProps>;

export type GetAppDatasetCollectionParams = {
  appId: string;
};
