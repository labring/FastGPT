import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { Model, Schema, model, models } from 'mongoose';
import { ResourcePermissionCollectionName } from './constant';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

export const ResourcePermissionSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName
  },
  teamMemberId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName
  },
  resourceType: {
    type: ResourceTypeEnum,
    required: true
  },
  permission: {
    type: Number,
    required: true
  }
});

export const MongoResourcePermission: Model<ResourcePermissionType> =
  models[ResourcePermissionCollectionName] ||
  model(ResourcePermissionCollectionName, ResourcePermissionSchema);
