import { Schema, model, models, Model } from 'mongoose';
import { ChatSchema as ChatType } from '@/types/mongoSchema';
import { ChatRoleMap } from '@/constants/chat';

const InstallAppSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  modelId: {
    type: Schema.Types.ObjectId,
    ref: 'model',
    required: true
  }
});

export const InstallApp: Model<ChatType> = models['installApp'] || model('chat', InstallAppSchema);
