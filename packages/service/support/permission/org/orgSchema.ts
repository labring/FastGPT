import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { OrgMemberCollectionName } from './orgMemberSchema';
import { ResourcePermissionCollectionName } from '../schema';
import { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import { OrgCollectionName } from '@fastgpt/global/support/user/team/org/constant';
const { Schema } = connectionMongo;

function requiredStringPath(this: OrgSchemaType) {
  return typeof this.path === 'string' ? false : true;
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
