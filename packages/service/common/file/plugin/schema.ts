import { Schema, getMongoModel } from '../../mongo';

export type FastGPTPluginSchema = {
  toolId?: string;
  type: 'tool';
  url: string;
};

const collectionName = 'fastgpt_plugins';

const FastGPTPluginSchema = new Schema({
  toolId: {
    type: String,
    required: false
  },
  type: {
    type: String,
    required: true,
    enum: ['tool'],
    default: 'tool'
  },
  url: {
    type: String,
    required: true
  }
});

export const MongoFastGPTPlugin = getMongoModel<FastGPTPluginSchema>(
  collectionName,
  FastGPTPluginSchema
);
