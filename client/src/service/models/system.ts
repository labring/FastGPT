import { Schema, model, models } from 'mongoose';

const SystemSchema = new Schema({
  openAIKeys: {
    type: String,
    default: ''
  },
  openAITrainingKeys: {
    type: String,
    default: ''
  },
  gpt4Key: {
    type: String,
    default: ''
  },
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
