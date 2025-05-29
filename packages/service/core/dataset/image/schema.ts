import { getMongoModel, Schema } from '../../../common/mongo';
import type { DatasetImageSchema } from '@fastgpt/global/core/dataset/image/type';
import mongoose from 'mongoose';

export const DatasetCollectionImageCollectionName = 'dataset_collection_images';

const DatasetImageMongoSchema = new Schema({
  teamId: {
    type: String,
    required: true
  },
  datasetId: {
    type: String,
    required: true
  },
  collectionId: {
    type: String,
    required: false,
    default: null
  },
  name: {
    type: String,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  contentType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  metadata: {
    type: Object,
    default: {}
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  expiredTime: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  }
});

DatasetImageMongoSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 0 });

// Create compound index for better query performance
DatasetImageMongoSchema.index({ teamId: 1, datasetId: 1, collectionId: 1 });

mongoose.model('dataset_collection_images', DatasetImageMongoSchema, 'dataset_collection_images');

export const MongoDatasetCollectionImage = getMongoModel<DatasetImageSchema>(
  DatasetCollectionImageCollectionName,
  DatasetImageMongoSchema
);
