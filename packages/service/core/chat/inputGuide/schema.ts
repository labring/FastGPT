import { AppCollectionName } from '../../app/schema';
import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { ChatInputGuideSchemaType } from '@fastgpt/global/core/chat/inputGuide/type';
import { getLogger, LogCategories } from '../../../common/logger';

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
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build chat input guide indexes', { error });
}

export const MongoChatInputGuide = getMongoModel<ChatInputGuideSchemaType>(
  ChatInputGuideCollectionName,
  ChatInputGuideSchema
);
