import mongoose, { Schema, type InferSchemaType, type Model, type Mongoose } from 'mongoose';
import { tables } from '../../db';
import { defineIndex } from '../indexes';
import type { WithId__v } from '../types';
import { getDalModel } from './helper';

export const TeamDocumentSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: tables.user
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  createTime: {
    type: Date,
    default: () => Date.now()
  },
  balance: Number,
  limit: {
    lastExportDatasetTime: Date,
    lastWebsiteSyncTime: Date
  },
  openaiAccount: {
    type: {
      key: String,
      baseUrl: String
    }
  },
  externalWorkflowVariables: {
    type: Object,
    default: {}
  },
  notificationAccount: String,
  meta: Object,
  deleteTime: Date
});

defineIndex(TeamDocumentSchema, { key: { name: 1 } });
defineIndex(TeamDocumentSchema, { key: { ownerId: 1 } });
defineIndex(TeamDocumentSchema, {
  key: { 'meta.wecom.corpId': 1 },
  options: { sparse: true, unique: true }
});

export type TeamMongooseSchemaType = InferSchemaType<typeof TeamDocumentSchema>;
export type TeamDocument = WithId__v<TeamMongooseSchemaType>;

export const getTeamModel = (client: Mongoose = mongoose): Model<TeamMongooseSchemaType> => {
  return getDalModel<TeamMongooseSchemaType>(client, 'Team', TeamDocumentSchema, tables.team);
};
