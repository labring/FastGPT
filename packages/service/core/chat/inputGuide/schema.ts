import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { ChatInputGuideSchemaType } from '@fastgpt/global/core/chat/inputGuide/type.d';

export const AppQGuideCollectionName = 'chat_input_guides';

const AppQGuideSchema = new Schema({
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppQGuideCollectionName,
    required: true
  },
  text: {
    type: String,
    default: ''
  }
});

try {
  AppQGuideSchema.index({ appId: 1, text: 1 }, { unique: true });
} catch (error) {
  console.log(error);
}

export const MongoChatInputGuide: Model<ChatInputGuideSchemaType> =
  models[AppQGuideCollectionName] || model(AppQGuideCollectionName, AppQGuideSchema);

MongoChatInputGuide.syncIndexes();
