import type { EnterpriseRoleBindingSchemaType } from '@fastgpt/global/support/enterprise/rbac/type';
import { EnterpriseRoleEnum } from '@fastgpt/global/support/enterprise/rbac/constants';
import { Schema, getMongoModel } from '../../../common/mongo';

export const EnterpriseRoleBindingCollectionName = 'enterpriseRoleBindings';

const EnterpriseRoleBindingSchema = new Schema({
  teamId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  tmbId: String,
  roles: {
    type: [String],
    enum: Object.values(EnterpriseRoleEnum),
    default: []
  },
  createdBy: String,
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

EnterpriseRoleBindingSchema.index({ teamId: 1, userId: 1 }, { unique: true });
EnterpriseRoleBindingSchema.index({ teamId: 1, roles: 1 });

export const MongoEnterpriseRoleBinding = getMongoModel<EnterpriseRoleBindingSchemaType>(
  EnterpriseRoleBindingCollectionName,
  EnterpriseRoleBindingSchema
);
