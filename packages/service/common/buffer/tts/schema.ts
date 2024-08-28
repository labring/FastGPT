import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { TTSBufferSchemaType } from './type.d';

export const collectionName = 'buffer_tts';

const TTSBufferSchema = new Schema({
  bufferId: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  buffer: {
    type: Buffer,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

try {
  TTSBufferSchema.index({ bufferId: 1 });
  //  24 hour
  TTSBufferSchema.index({ createTime: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
} catch (error) {
  console.log(error);
}

export const MongoTTSBuffer = getMongoModel<TTSBufferSchemaType>(collectionName, TTSBufferSchema);
