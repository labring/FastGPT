import mongoose, { Schema, type InferSchemaType, type Model, type Mongoose } from 'mongoose';
import { tables } from '../../../../../../../db';
import { defineIndex } from '../../../../../../indexes';
import type { WithId__v } from '../../../../../../types';
import { getDalModel } from '../../../../../../model';

export const OrgMemberDocumentSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  orgId: {
    type: Schema.Types.ObjectId,
    ref: 'Org',
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: 'TeamMember',
    required: true
  }
});

OrgMemberDocumentSchema.virtual('org', {
  ref: 'Org',
  localField: 'orgId',
  foreignField: '_id',
  justOne: true
});

defineIndex(OrgMemberDocumentSchema, {
  key: { teamId: 1, orgId: 1, tmbId: 1 },
  options: { unique: true }
});
defineIndex(OrgMemberDocumentSchema, { key: { teamId: 1, tmbId: 1 } });

export type OrgMemberMongooseSchemaType = InferSchemaType<typeof OrgMemberDocumentSchema>;
export type OrgMemberDocument = WithId__v<OrgMemberMongooseSchemaType>;

export const getOrgMemberModel = (
  client: Mongoose = mongoose
): Model<OrgMemberMongooseSchemaType> =>
  getDalModel<OrgMemberMongooseSchemaType>(
    client,
    'OrgMember',
    OrgMemberDocumentSchema,
    tables.teamOrgMember
  );
