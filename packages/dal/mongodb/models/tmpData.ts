import mongoose, { Schema, type InferSchemaType, type Model, type Mongoose } from 'mongoose';
import { tables } from '../../db';
import { defineIndex } from '../indexes';
import type { WithId__v } from '../types';
import { getDalModel } from './helper';

export const TmpDataDocumentSchema = new Schema({
  dataId: {
    type: String,
    required: true
  },
  data: Object,
  expireAt: {
    type: Date,
    required: true
  }
});

defineIndex(TmpDataDocumentSchema, {
  key: { dataId: 1 },
  options: { unique: true }
});
defineIndex(TmpDataDocumentSchema, { key: { dataId: -1 } });
defineIndex(TmpDataDocumentSchema, {
  key: { expireAt: -1 },
  options: { expireAfterSeconds: 5 }
});

export type TmpDataMongooseSchemaType = InferSchemaType<typeof TmpDataDocumentSchema>;
export type TmpDataDocument = WithId__v<TmpDataMongooseSchemaType>;

export const getTmpDataModel = (client: Mongoose = mongoose): Model<TmpDataMongooseSchemaType> => {
  return getDalModel<TmpDataMongooseSchemaType>(
    client,
    'TmpData',
    TmpDataDocumentSchema,
    tables.tmpData
  );
};
