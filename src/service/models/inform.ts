import { Schema, model, models, Model } from 'mongoose';
import { informSchema } from '@/types/mongoSchema';
import { InformTypeMap } from '@/constants/user';

const InformSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  time: {
    type: Date,
    default: () => new Date()
  },
  type: {
    type: String,
    enum: Object.keys(InformTypeMap)
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  }
});

try {
  InformSchema.index({ time: -1 });
  InformSchema.index({ userId: 1 });
} catch (error) {
  console.log(error);
}

export const Inform: Model<informSchema> = models['inform'] || model('inform', InformSchema);
