import { getMongoModel, type Types, Schema } from '../../mongo';

export const bucketName = 'buffer_rawtext';

const RawTextBufferSchema = new Schema({
  metadata: {
    sourceId: { type: String, required: true },
    sourceName: { type: String, required: true },
    expiredTime: { type: Date, required: true }
  }
});
RawTextBufferSchema.index({ 'metadata.sourceId': 'hashed' });
RawTextBufferSchema.index({ 'metadata.expiredTime': -1 });

export const MongoRawTextBufferSchema = getMongoModel<{
  _id: Types.ObjectId;
  metadata: {
    sourceId: string;
    sourceName: string;
    expiredTime: Date;
  };
}>(`${bucketName}.files`, RawTextBufferSchema);
