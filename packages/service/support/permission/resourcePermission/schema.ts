import { SchemaType, connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';

// element of the UserPermissionTable
const UserPermissionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  permission: Number
});

// TODO: unimplemented
// // element of the GroupPermission
// const GroupPermissionSchema = new Schema({})

// Permission infomation
export const ResourcePermissonSchema = new Schema({
  metaData: {
    owner: {
      type: Schema.Types.ObjectId, // owner of the resource
      ref: TeamMemberCollectionName,
      required: true
    },
    ownerPermission: Number, // permission of the owner, which should be always the highest permission
    defaultPermission: Number // default permission for the resource
  },
  userPermissionTable: [UserPermissionSchema]
  // groupPermission: {} // TODO: unimplemented
});

export const MongoUserPermission: Model<SchemaType> =
  models['user_permission'] || model('user_permission', UserPermissionSchema);

export const MongoResourcePermission: Model<SchemaType> =
  models['resource_permission'] || model('resource_permission', ResourcePermissonSchema);

export const UserPermissionCollectionName = 'user_permission';
export const ResourcePermissionCollectionName = 'resource_permission';
