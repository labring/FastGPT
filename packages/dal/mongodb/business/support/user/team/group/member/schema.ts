import mongoose, { Schema, type InferSchemaType, type Model, type Mongoose } from 'mongoose';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { tables } from '../../../../../../../db';
import { defineIndex } from '../../../../../../indexes';
import type { WithId__v } from '../../../../../../types';
import { getDalModel } from '../../../../../../model';

export const GroupMemberDocumentSchema = new Schema({
  groupId: {
    type: Schema.Types.ObjectId,
    ref: 'MemberGroup',
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: 'TeamMember',
    required: true
  },
  role: {
    type: String,
    enum: Object.values(GroupMemberRole),
    required: true,
    default: GroupMemberRole.member
  }
});

GroupMemberDocumentSchema.virtual('group', {
  ref: 'MemberGroup',
  localField: 'groupId',
  foreignField: '_id',
  justOne: true
});

defineIndex(GroupMemberDocumentSchema, { key: { groupId: 1 } });
defineIndex(GroupMemberDocumentSchema, { key: { tmbId: 1 } });

export type GroupMemberMongooseSchemaType = InferSchemaType<typeof GroupMemberDocumentSchema>;
export type GroupMemberDocument = WithId__v<GroupMemberMongooseSchemaType>;

export const getGroupMemberModel = (
  client: Mongoose = mongoose
): Model<GroupMemberMongooseSchemaType> =>
  getDalModel<GroupMemberMongooseSchemaType>(
    client,
    'GroupMember',
    GroupMemberDocumentSchema,
    tables.teamGroupMember
  );
