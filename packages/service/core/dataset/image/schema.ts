import type { Types } from '../../../common/mongo';
import { getMongoModel, Schema } from '../../../common/mongo';

export const bucketName = 'dataset_image';

const MongoDatasetImage = new Schema({
  length: { type: Number, required: true },
  chunkSize: { type: Number, required: true },
  uploadDate: { type: Date, required: true },
  filename: { type: String, required: true },
  contentType: { type: String, required: true },
  metadata: {
    teamId: { type: String, required: true },
    datasetId: { type: String, required: true },
    collectionId: { type: String },
    expiredTime: { type: Date, required: true }
  }
});
MongoDatasetImage.index({ 'metadata.datasetId': 'hashed' });
MongoDatasetImage.index({ 'metadata.collectionId': 'hashed' });
MongoDatasetImage.index({ 'metadata.expiredTime': -1 });

export const MongoDatasetImageSchema = getMongoModel<{
  _id: Types.ObjectId;
  length: number;
  chunkSize: number;
  uploadDate: Date;
  filename: string;
  contentType: string;
  metadata: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    expiredTime: Date;
  };
}>(`${bucketName}.files`, MongoDatasetImage);
