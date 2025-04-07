import { connectionLogMongo, getMongoModel } from '../../common/mongo';
const { Schema, model, models } = connectionLogMongo;
import type { operationLogSchema } from '@fastgpt/global/support/operationLog/type';
import { operationLogTemplateCodeEnum } from '@fastgpt/global/support/operationLog/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const OperationLogCollectionName = 'operationLog';

const OperationLogSchema = new Schema({
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  timestamp: {
    type: Date,
    default: () => new Date()
  },
  event: {
    type: String,
    enum: Object.keys(operationLogTemplateCodeEnum),
    required: true
  },
  metadata: {
    type: Object,
    default: {}
  }
});

export const MongoOperationLog = getMongoModel<operationLogSchema>(
  OperationLogCollectionName,
  OperationLogSchema
);
