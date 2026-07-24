import { AppCollectionName } from '../../app/schema';
import { defineIndex, connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { ChatInputGuideSchemaType } from '@fastgpt/global/core/chat/inputGuide/type';

export const ChatInputGuideCollectionName = 'chat_input_guides';

const ChatInputGuideSchema = new Schema({
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    required: true
  },
  text: {
    type: String,
    default: ''
  }
});

defineIndex(ChatInputGuideSchema, {
  key: { appId: 1, text: 1 },
  options: { unique: true }
});

export const MongoChatInputGuide = getMongoModel<ChatInputGuideSchemaType>(
  ChatInputGuideCollectionName,
  ChatInputGuideSchema
);
