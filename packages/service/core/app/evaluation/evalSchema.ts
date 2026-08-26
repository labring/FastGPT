import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
import { AppCollectionName } from '../schema';
import type { EvaluationSchemaType } from '@fastgpt/global/core/app/evaluation/type';
import { UsageCollectionName } from '../../../support/wallet/usage/constants';
import { SystemModelCollectionName } from '../../ai/config/constants';
const { Schema } = connectionMongo;

export const EvaluationCollectionName = 'evals';

const EvaluationSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    required: true
  },
  usageId: {
    type: Schema.Types.ObjectId,
    ref: UsageCollectionName,
    required: true
  },
  evalModel: {
    type: String
  },
  evalModelId: {
    type: Schema.Types.ObjectId,
    ref: SystemModelCollectionName
  },
  name: {
    type: String,
    required: true
  },
  createTime: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  finishTime: Date,
  score: Number,
  errorMessage: String
});

defineIndex(EvaluationSchema, { key: { teamId: 1 } });

export const MongoEvaluation = getMongoModel<EvaluationSchemaType>(
  EvaluationCollectionName,
  EvaluationSchema
);
