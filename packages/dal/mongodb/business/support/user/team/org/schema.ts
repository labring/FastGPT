import mongoose, { Schema, type InferSchemaType, type Model, type Mongoose } from 'mongoose';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { tables } from '../../../../../../db';
import { defineIndex } from '../../../../../indexes';
import type { WithId__v } from '../../../../../types';
import { getDalModel } from '../../../../../model';

export const OrgDocumentSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: tables.team,
      required: true
    },
    pathId: {
      type: String,
      required: true,
      default: () => getNanoid()
    },
    path: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    avatar: String,
    description: String,
    updateTime: {
      type: Date,
      default: () => new Date()
    }
  },
  {
    timestamps: {
      updatedAt: 'updateTime'
    }
  }
);

defineIndex(OrgDocumentSchema, {
  key: { teamId: 1, path: 1 }
});
defineIndex(OrgDocumentSchema, {
  key: { teamId: 1, pathId: 1 },
  options: { unique: true }
});

export type OrgMongooseSchemaType = InferSchemaType<typeof OrgDocumentSchema>;
export type OrgDocument = WithId__v<OrgMongooseSchemaType>;

export const getOrgModel = (client: Mongoose = mongoose): Model<OrgMongooseSchemaType> => {
  return getDalModel<OrgMongooseSchemaType>(client, 'Org', OrgDocumentSchema, tables.teamOrg);
};
