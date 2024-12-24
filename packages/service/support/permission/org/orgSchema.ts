import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { OrgCollectionName } from '@fastgpt/global/support/user/team/org/constant';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { ResourcePermissionCollectionName } from '../schema';
import { OrgMemberCollectionName } from './orgMemberSchema';
const { Schema } = connectionMongo;

function requiredStringPath(this: OrgSchemaType) {
  return typeof this.path !== 'string';
}

export const OrgSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: TeamCollectionName,
      required: true
    },
    path: {
      type: String,
      required: requiredStringPath
    },
    name: {
      type: String,
      required: true
    },
    avatar: {
      type: String
    },
    description: {
      type: String
    },
    updateTime: {
      type: Date,
      default: () => new Date()
    }
  },
  {
    // Auto update updateTime
    timestamps: {
      updatedAt: 'updateTime'
    }
  }
);

OrgSchema.virtual('members', {
  ref: OrgMemberCollectionName,
  localField: '_id',
  foreignField: 'orgId'
});
OrgSchema.virtual('permission', {
  ref: ResourcePermissionCollectionName,
  localField: '_id',
  foreignField: 'orgId',
  justOne: true
});

try {
  OrgSchema.index(
    {
      teamId: 1,
      path: 1,
      name: 1
    },
    {
      unique: true
    }
  );
  OrgSchema.index({ path: 1 });
} catch (error) {
  console.log(error);
}

export const MongoOrgModel = getMongoModel<OrgSchemaType>(OrgCollectionName, OrgSchema);
