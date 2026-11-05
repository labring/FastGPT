import { buildChatPublishSourceFilter } from '../../chat/publishSource/utils';
import { Types } from '../../../common/mongo';
import type { FilterQuery } from 'mongoose';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';
import type { getAppChatLogsBody } from '@fastgpt/global/openapi/core/app/log/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isUnselectedLogUserFilter } from '@fastgpt/global/core/app/logs/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

/** 列表和流式导出共用筛选条件；各组 $or 使用 $and 连接，避免用户/反馈/搜索互相覆盖。 */
export const buildAppChatLogFilter = ({
  appId,
  dateStart,
  dateEnd,
  sources,
  tmbIds,
  outLinkUids,
  chatSearch,
  feedbackType,
  unreadOnly,
  errorFilter
}: Omit<getAppChatLogsBody, 'pageNum' | 'pageSize'>): FilterQuery<ChatSchemaType> => {
  const conditions: FilterQuery<ChatSchemaType>[] = [
    { $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }] }
  ];
  if (sources !== undefined) conditions.push(buildChatPublishSourceFilter(sources));
  const goodField = unreadOnly ? 'hasUnreadGoodFeedback' : 'hasGoodFeedback';
  const badField = unreadOnly ? 'hasUnreadBadFeedback' : 'hasBadFeedback';
  if (feedbackType === 'has_feedback') {
    conditions.push({ $or: [{ [goodField]: true }, { [badField]: true }] });
  } else if (feedbackType === 'good' || feedbackType === 'bad') {
    conditions.push({ [feedbackType === 'good' ? goodField : badField]: true });
  }
  // 两个显式空数组代表没有选中任何使用者；省略两者才是不筛选。
  if (tmbIds?.length || outLinkUids?.length || isUnselectedLogUserFilter(tmbIds, outLinkUids)) {
    const users: FilterQuery<ChatSchemaType>[] = [
      ...(tmbIds?.length
        ? [
            {
              tmbId: { $in: tmbIds.map((id) => new Types.ObjectId(id)) },
              outLinkUid: { $in: [null, ''] }
            }
          ]
        : []),
      ...(outLinkUids?.length ? [{ outLinkUid: { $in: outLinkUids } }] : [])
    ];
    conditions.push(users.length ? { $or: users } : { _id: { $in: [] } });
  }
  if (chatSearch) {
    const regex = new RegExp(replaceRegChars(chatSearch), 'i');
    conditions.push({ $or: [{ chatId: regex }, { title: regex }, { customTitle: regex }] });
  }
  return {
    appId: new Types.ObjectId(appId),
    updateTime: { $gte: new Date(dateStart), $lte: new Date(dateEnd) },
    ...(errorFilter === 'has_error' ? { errorCount: { $gt: 0 } } : {}),
    $and: conditions
  };
};
