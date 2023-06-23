import { Schema, model, models } from 'mongoose';

const SystemSchema = new Schema({
  vectorMaxProcess: {
    type: Number,
    default: 10
  },
  qaMaxProcess: {
    type: Number,
    default: 10
  },
  pgIvfflatProbe: {
    type: Number,
    default: 10
  },
  sensitiveCheck: {
    type: Boolean,
    default: false
  }
});

export const System = models['system'] || model('system', SystemSchema);
