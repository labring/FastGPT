import mongoose, { Schema, type InferSchemaType, type Model, type Mongoose } from 'mongoose';
import { tables } from '../../../../../../db';
import { defineIndex } from '../../../../../indexes';
import type { WithId__v } from '../../../../../types';
import { getDalModel } from '../../../../../model';

export const MemberGroupDocumentSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: tables.team,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    avatar: String,
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

defineIndex(MemberGroupDocumentSchema, {
  key: { teamId: 1, name: 1 },
  options: { unique: true }
});

export type MemberGroupMongooseSchemaType = InferSchemaType<typeof MemberGroupDocumentSchema>;
export type MemberGroupDocument = WithId__v<MemberGroupMongooseSchemaType>;

export const getMemberGroupModel = (
  client: Mongoose = mongoose
): Model<MemberGroupMongooseSchemaType> => {
  return getDalModel<MemberGroupMongooseSchemaType>(
    client,
    'MemberGroup',
    MemberGroupDocumentSchema,
    tables.teamMemberGroup
  );
};
