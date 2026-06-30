import { connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import type { ChatItemResponseSchemaType } from '@fastgpt/global/core/chat/type';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { ChatItemResponseCollectionName } from './constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const ChatItemResponseSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  sourceType: {
    type: String,
    enum: Object.values(ChatSourceTypeEnum),
    required: true
  },
  // 历史物理字段名，业务语义为 sourceId；App 场景才是真实 appId。
  appId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  chatId: {
    type: String,
    require: true
  },
  chatItemDataId: {
    type: String,
    require: true
  },
  data: {
    type: Object,
    default: {}
  },

  time: {
    type: Date,
    default: () => new Date()
  }
});

/* TODO: 未全面检查操作，所以这里暂时不加 sourceType 的索引。 */
// 按 chat item 拉取完整 nodeResponse rows；复合索引包含 _id，避免详情读取时额外排序。
ChatItemResponseSchema.index({ appId: 1, chatId: 1, chatItemDataId: 1, _id: 1 });
// Clear expired response
ChatItemResponseSchema.index({ teamId: 1, time: -1 });

export const MongoChatItemResponse = getMongoModel<ChatItemResponseSchemaType>(
  ChatItemResponseCollectionName,
  ChatItemResponseSchema
);
