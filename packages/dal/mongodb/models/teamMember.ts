import mongoose, { Schema, type InferSchemaType, type Model, type Mongoose } from 'mongoose';
import { TeamMemberStatusMap } from '@fastgpt/global/support/user/team/constant';
import { getRandomUserAvatar } from '@fastgpt/global/support/user/utils';
import { tables } from '../../db';
import { defineIndex } from '../indexes';
import type { WithId__v } from '../types';
import { getDalModel } from './helper';

export const TeamMemberDocumentSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: tables.team,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: tables.user,
    required: true
  },
  avatar: {
    type: String,
    default: () => getRandomUserAvatar()
  },
  name: {
    type: String,
    default: 'Member'
  },
  status: {
    type: String,
    enum: Object.keys(TeamMemberStatusMap)
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: Date,
  /** @deprecated 部分旧代码仍用 role 判断 owner，保留字段与生产一致。 */
  role: String,
  /** @deprecated */
  defaultTeam: Boolean
});

defineIndex(TeamMemberDocumentSchema, {
  key: { teamId: 1 },
  options: { background: true }
});
defineIndex(TeamMemberDocumentSchema, {
  key: { userId: 1 },
  options: { background: true }
});

export type TeamMemberMongooseSchemaType = InferSchemaType<typeof TeamMemberDocumentSchema>;
export type TeamMemberDocument = WithId__v<TeamMemberMongooseSchemaType>;

export const getTeamMemberModel = (
  client: Mongoose = mongoose
): Model<TeamMemberMongooseSchemaType> => {
  return getDalModel<TeamMemberMongooseSchemaType>(
    client,
    'TeamMember',
    TeamMemberDocumentSchema,
    tables.teamMember
  );
};
