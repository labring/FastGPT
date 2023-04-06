import { Schema, model, models, Model } from 'mongoose';
import { OpenApiSchema } from '@/types/mongoSchema';

const OpenApiSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  lastUsedTime: {
    type: Date,
    default: () => new Date()
  }
});

export const OpenApi: Model<OpenApiSchema> = models['openapi'] || model('openapi', OpenApiSchema);
