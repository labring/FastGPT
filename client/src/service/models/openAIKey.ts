import { openAIKeySchema as openAIKeyType } from '@/types/mongoSchema';
import dayjs from 'dayjs';
import { Schema, model, models, Model } from 'mongoose';

const openAIKeySchema = new Schema(
  {
    // OPENAI KEY INFO
    apikey: { type: String, required: true, unique: true },
    balanceTotal: { type: Number, default: 0 },
    balanceUsed: { type: Number, default: 0 },
    balanceAvailable: { type: Number, default: 0 },
    isGPT4: { type: Boolean, default: false },
    expiresAt: { type: Date, default: dayjs().add(1, 'month').toDate() },
    cardLinked: { type: Boolean, default: false },
    // CUSTOM USED
    rpm: { type: Number, default: 5 },
    rpmAvailable: { type: Number, default: 5 },
    lastUsedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    // 只用于展示错误消息，不用于判断
    error: { type: String, default: '' }
  },
  { timestamps: true }
);

export const OpenAIKey: Model<openAIKeyType> =
  models['openaikey'] || model('openaikey', openAIKeySchema);
