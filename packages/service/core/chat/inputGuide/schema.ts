import { AppCollectionName } from '../../app/schema';
import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { ChatInputGuideSchemaType } from '@fastgpt/global/core/chat/inputGuide/type.d';

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

try {
  ChatInputGuideSchema.index({ appId: 1, text: 1 }, { unique: true });
} catch (error) {
  console.log(error);
}

export const MongoChatInputGuide = getMongoModel<ChatInputGuideSchemaType>(
  ChatInputGuideCollectionName,
  ChatInputGuideSchema
);
