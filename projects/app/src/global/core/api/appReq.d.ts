import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { PaginationProps } from '@fastgpt/web/common/fetch/type';
import type { I18nName } from '@fastgpt/service/common/geo/type';

export type GetAppChatLogsProps = {
  appId: string;
  dateStart: string | Date;
  dateEnd: string | Date;
  sources?: ChatSourceEnum[];
  tmbIds?: string[];
  chatSearch?: string;
};

export type GetAppChatLogsParams = PaginationProps<GetAppChatLogsProps>;
