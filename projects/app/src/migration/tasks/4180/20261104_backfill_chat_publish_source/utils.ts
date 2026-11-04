import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatPublishSourceSchema } from '@fastgpt/global/core/chat/publishSource/type';

export const LegacyPublishSourceRecordSchema = z.object({
  _id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  appId: ObjectIdSchema,
  sourceType: z.enum(ChatSourceTypeEnum).optional(),
  source: z.enum(ChatSourceEnum),
  shareId: z.string().nullish(),
  sourceName: z.string().nullish(),
  publishSource: ChatPublishSourceSchema.nullish()
});
export type LegacyPublishSourceRecord = z.infer<typeof LegacyPublishSourceRecordSchema>;

/** 旧内部入口即使残留 shareId 也不推断为外链；API/MCP 没有可靠旧引用。 */
export const canRestoreOutLinkReference = (record: LegacyPublishSourceRecord) =>
  (!record.sourceType || record.sourceType === ChatSourceTypeEnum.app) &&
  !!record.shareId &&
  [
    ChatSourceEnum.share,
    ChatSourceEnum.feishu,
    ChatSourceEnum.wecom,
    ChatSourceEnum.wechat,
    ChatSourceEnum.official_account,
    ChatSourceEnum.dingtalk
  ].includes(record.source);
