import { OrgCollectionName } from '@fastgpt/global/support/user/team/org/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { type OrgMemberSchemaType } from '@fastgpt/global/support/user/team/org/type';
const { Schema } = connectionMongo;

export const OrgMemberCollectionName = 'team_org_members';

export const OrgMemberSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  orgId: {
    type: Schema.Types.ObjectId,
    ref: OrgCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  }
  // role: {
  //   type: String,
  //   enum: Object.values(OrgMemberRole),
  //   required: true,
  //   default: OrgMemberRole.member
  // }
});

OrgMemberSchema.virtual('org', {
  ref: OrgCollectionName,
  localField: 'orgId',
  foreignField: '_id',
  justOne: true
});

try {
  OrgMemberSchema.index(
    {
      teamId: 1,
      orgId: 1,
      tmbId: 1
    },
    {
      unique: true
    }
  );
  OrgMemberSchema.index({
    teamId: 1,
    tmbId: 1
  });
} catch (error) {
  console.log(error);
}

export const MongoOrgMemberModel = getMongoModel<OrgMemberSchemaType>(
  OrgMemberCollectionName,
  OrgMemberSchema
);
