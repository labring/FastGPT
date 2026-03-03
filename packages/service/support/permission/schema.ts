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
    ref: TeamCollectionName,
    required: true
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
  /**
   * The **Role** of the object to the resource.
   */
  permission: {
    type: Number,
    required: true
  },

  /**
   * Optional. Only be set when the resource is *inherited* from the parent resource.
   * For recording the self permission. When cancel the inheritance, it will overwrite the permission property and set to `unset`.
   */
  resourceId: {
    type: Schema.Types.ObjectId
  },

  /**
   * Optional, For some resources, which do not have resourceId, the resourceName is required.
   */
  resourceName: {
    type: String
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
  ResourcePermissionSchema.index({
    resourceType: 1,
    teamId: 1
  });

  // Indexes for resourceId-based resources
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
        },
        resourceId: {
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
        },
        resourceId: {
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
        },
        resourceId: {
          $exists: true
        }
      }
    }
  );

  // General index for resourceId-based resources
  ResourcePermissionSchema.index(
    {
      resourceType: 1,
      teamId: 1,
      resourceId: 1
    },
    {
      partialFilterExpression: {
        resourceId: {
          $exists: true
        }
      }
    }
  );

  // Indexes for resourceName-based resources
  ResourcePermissionSchema.index(
    {
      resourceType: 1,
      teamId: 1,
      resourceName: 1,
      groupId: 1
    },
    {
      unique: true,
      partialFilterExpression: {
        groupId: {
          $exists: true
        },
        resourceName: {
          $exists: true
        }
      }
    }
  );

  ResourcePermissionSchema.index(
    {
      resourceType: 1,
      teamId: 1,
      resourceName: 1,
      orgId: 1
    },
    {
      unique: true,
      partialFilterExpression: {
        orgId: {
          $exists: true
        },
        resourceName: {
          $exists: true
        }
      }
    }
  );

  ResourcePermissionSchema.index(
    {
      resourceType: 1,
      teamId: 1,
      resourceName: 1,
      tmbId: 1
    },
    {
      unique: true,
      partialFilterExpression: {
        tmbId: {
          $exists: true
        },
        resourceName: {
          $exists: true
        }
      }
    }
  );

  // General index for resourceName-based resources
  ResourcePermissionSchema.index(
    {
      resourceType: 1,
      teamId: 1,
      resourceName: 1
    },
    {
      partialFilterExpression: {
        resourceName: {
          $exists: true
        }
      }
    }
  );
} catch (error) {
  console.log(error);
}

ResourcePermissionSchema.pre('save', function (next) {
  if (!this.tmbId && !this.groupId && !this.orgId) {
    return next(new Error('At least one of tmbId, groupId, orgId must be present'));
  }
  next();
});

export const MongoResourcePermission = getMongoModel<ResourcePermissionType>(
  ResourcePermissionCollectionName,
  ResourcePermissionSchema
);
