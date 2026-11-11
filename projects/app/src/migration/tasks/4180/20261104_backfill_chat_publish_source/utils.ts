import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatPublishSourceSchema } from '@fastgpt/global/core/chat/publishSource/type';

export const LegacyPublishSourceRecordSchema = z.object({
  _id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  appId: ObjectIdSchema,
  // 旧资源类型只用于判断能否恢复外链引用，不参与 publishSource.type 转换。
  sourceType: z.unknown().optional(),
  // 旧版曾将渠道名称写入 source；仅来源解析失败时归为未知，不吞掉其他字段错误。
  source: z.enum(ChatSourceEnum).catch(ChatSourceEnum.unknown),
  shareId: z.string().nullish(),
  sourceName: z.string().nullish(),
  publishSource: ChatPublishSourceSchema.nullish()
});
export type LegacyPublishSourceRecord = z.infer<typeof LegacyPublishSourceRecordSchema>;

/** 仅明确 App 或缺失旧资源类型时恢复引用；未知类型不猜测归属，仍可回填来源分类。 */
export const canRestoreOutLinkReference = (record: LegacyPublishSourceRecord) =>
  (record.sourceType === undefined || record.sourceType === ChatSourceTypeEnum.app) &&
  !!record.shareId &&
  [
    ChatSourceEnum.share,
    ChatSourceEnum.feishu,
    ChatSourceEnum.wecom,
    ChatSourceEnum.wechat,
    ChatSourceEnum.official_account,
    ChatSourceEnum.dingtalk
  ].includes(record.source);
