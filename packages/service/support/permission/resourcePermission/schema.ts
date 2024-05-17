import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { Model, connectionMongo } from '../../../common/mongo';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
const { Schema, model, models } = connectionMongo;

export const ResourcePermissionSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName
  },
  resourceType: {
    type: Object.values(ResourceTypeEnum),
    required: true
  },
  permission: {
    type: Number,
    required: true
  }
});

try {
  ResourcePermissionSchema.index({
    teamId: 1,
    resourceType: 1
  });
  ResourcePermissionSchema.index({
    tmbId: 1,
    resourceType: 1
  });
} catch (error) {
  console.log(error);
}

export const ResourcePermissionCollectionName = 'resource_permission';

export const MongoResourcePermission: Model<ResourcePermissionType> =
  models[ResourcePermissionCollectionName] ||
  model(ResourcePermissionCollectionName, ResourcePermissionSchema);

MongoResourcePermission.syncIndexes();
