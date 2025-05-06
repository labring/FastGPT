import { Schema, getMongoLogModel } from '../../common/mongo';
import { type OperationLogSchema } from '@fastgpt/global/support/operationLog/type';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
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
    enum: Object.values(OperationLogEventEnum),
    required: true
  },
  metadata: {
    type: Object,
    default: {}
  }
});

export const MongoOperationLog = getMongoLogModel<OperationLogSchema>(
  OperationLogCollectionName,
  OperationLogSchema
);
