import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { AppCollectionName } from '../schema';
import type { EvaluationSchemaType } from './type';
const { Schema } = connectionMongo;

export const EvaluationCollectionName = 'evaluations';

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
  evalModel: {
    type: String,
    required: true
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
  score: Number
});

EvaluationSchema.index({ teamId: 1 });

export const MongoEvaluation = getMongoModel<EvaluationSchemaType>(
  EvaluationCollectionName,
  EvaluationSchema
);
