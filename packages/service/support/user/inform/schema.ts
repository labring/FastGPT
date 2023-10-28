import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { UserInformSchema } from '@fastgpt/global/support/user/type.d';
import { InformTypeMap } from '@fastgpt/global/support/user/constant';

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

export const MongoUserInform: Model<UserInformSchema> =
  models['inform'] || model('inform', InformSchema);
