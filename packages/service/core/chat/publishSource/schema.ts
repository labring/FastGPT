import { Schema } from '../../../common/mongo';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

/** Chat 与统计桶共用的多态渠道引用；名称只在响应中扩展。 */
export const chatPublishSourceMongoSchema = new Schema(
  {
    type: { type: String, enum: Object.values(ChatSourceEnum), required: true },
    id: Schema.Types.ObjectId
  },
  { _id: false }
);
