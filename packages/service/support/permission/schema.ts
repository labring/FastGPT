import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../common/mongo';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MemberGroupCollectionName } from './memberGroup/memberGroupSchema';
import { OrgCollectionName } from '@fastgpt/global/support/user/team/org/constant';
const { Schema } = connectionMongo;

export const ResourcePermissionCollectionName = 'resource_permissions';

export const ResourcePermissionSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName
  },
  groupId: {
    type: Schema.Types.ObjectId,
    ref: MemberGroupCollectionName
  },
  orgId: {
    type: Schema.Types.ObjectId,
    ref: OrgCollectionName
  },
  resourceType: {
    type: String,
    enum: Object.values(PerResourceTypeEnum),
    required: true
  },
  permission: {
    type: Number,
    required: true
  },
  // Resrouce ID: App or DataSet or any other resource type.
  // It is null if the resourceType is team.
  resourceId: {
    type: Schema.Types.ObjectId
  }
});

ResourcePermissionSchema.virtual('tmb', {
  ref: TeamMemberCollectionName,
  localField: 'tmbId',
  foreignField: '_id',
  justOne: true
});
ResourcePermissionSchema.virtual('group', {
  ref: MemberGroupCollectionName,
  localField: 'groupId',
  foreignField: '_id',
  justOne: true
});
ResourcePermissionSchema.virtual('org', {
  ref: OrgCollectionName,
  localField: 'orgId',
  foreignField: '_id',
  justOne: true
});

try {
  ResourcePermissionSchema.index(
    {
      resourceType: 1,
      teamId: 1,
      resourceId: 1,
      groupId: 1
    },
    {
      unique: true,
      partialFilterExpression: {
        groupId: {
          $exists: true
        }
      }
    }
  );

  ResourcePermissionSchema.index(
    {
      resourceType: 1,
      teamId: 1,
      resourceId: 1,
      orgId: 1
    },
    {
      unique: true,
      partialFilterExpression: {
        orgId: {
          $exists: true
        }
      }
    }
  );

  ResourcePermissionSchema.index(
    {
      resourceType: 1,
      teamId: 1,
      resourceId: 1,
      tmbId: 1
    },
    {
      unique: true,
      partialFilterExpression: {
        tmbId: {
          $exists: true
        }
      }
    }
  );

  // Delete tmb permission
  ResourcePermissionSchema.index({
    resourceType: 1,
    teamId: 1,
    resourceId: 1
  });
} catch (error) {
  console.log(error);
}

export const MongoResourcePermission = getMongoModel<ResourcePermissionType>(
  ResourcePermissionCollectionName,
  ResourcePermissionSchema
);
