import { model, Schema, type InferSchemaType } from 'mongoose';
import { tables } from '../../domain/types';
import type { WithId__v } from '../types';

export const UserDocumentSchema = new Schema({
  status: { type: String, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  promotionRate: { type: Number, required: true },
  timezone: { type: String, required: true },
  language: { type: String, required: true },
  tags: { type: [String], required: true },
  createTime: { type: Date, required: true },
  lastLoginTmbId: { type: Schema.Types.ObjectId, default: null }
});

export type UserMongooseSchemaType = InferSchemaType<typeof UserDocumentSchema>;
export type UserDocument = WithId__v<UserMongooseSchemaType>;

export const UserModel = model<UserMongooseSchemaType>('User', UserDocumentSchema, tables.user);
