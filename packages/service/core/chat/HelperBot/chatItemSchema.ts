import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { helperBotChatItemCollectionName } from './constants';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import type { HelperBotChatItemType } from '@fastgpt/global/core/chat/helperBot/type';

const HelperBotChatItemSchema = new Schema({
  userId: {
    type: String,
    require: true
  },
  chatId: {
    type: String,
    require: true
  },
  dataId: {
    type: String,
    require: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  obj: {
    type: String,
    require: true,
    enum: Object.values(ChatRoleEnum)
  },
  value: {
    type: Array,
    require: true
  },
  memories: Object
});

HelperBotChatItemSchema.index({ userId: 1, chatId: 1, dataId: 1, obj: 1 }, { unique: true });

export const MongoHelperBotChatItem = getMongoModel<HelperBotChatItemType>(
  helperBotChatItemCollectionName,
  HelperBotChatItemSchema
);
