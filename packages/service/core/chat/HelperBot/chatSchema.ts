import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { helperBotChatCollectionName } from './constants';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import type { HelperBotChatType } from '../../../../global/core/chat/helperBot/type';

const HelperBotChatSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: Object.values(HelperBotTypeEnum)
  },
  userId: {
    type: String,
    require: true
  },
  chatId: {
    type: String,
    require: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  metadata: Object
});

HelperBotChatSchema.index({ type: 1, userId: 1, chatId: 1 }, { unique: true });

export const MongoHelperBotChat = getMongoModel<HelperBotChatType>(
  helperBotChatCollectionName,
  HelperBotChatSchema
);
