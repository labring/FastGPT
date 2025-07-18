import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { EvaluationCollectionName } from './evalSchema';
import {
  EvaluationStatusEnum,
  EvaluationStatusValues
} from '@fastgpt/global/core/app/evaluation/constants';
import type { EvalItemSchemaType } from '@fastgpt/global/core/app/evaluation/type';

const { Schema } = connectionMongo;

export const EvalItemCollectionName = 'eval_items';

const EvalItemSchema = new Schema({
  evalId: {
    type: Schema.Types.ObjectId,
    ref: EvaluationCollectionName,
    required: true
  },
  question: {
    type: String,
    required: true
  },
  expectedResponse: {
    type: String,
    required: true
  },
  history: String,
  globalVariables: Object,
  response: String,
  responseTime: Date,

  status: {
    type: Number,
    default: EvaluationStatusEnum.queuing,
    enum: EvaluationStatusValues
  },
  retry: {
    type: Number,
    default: 3
  },
  finishTime: Date,

  accuracy: Number,
  relevance: Number,
  semanticAccuracy: Number,
  score: Number, // average score

  errorMessage: String
});

EvalItemSchema.index({ evalId: 1, status: 1 });

export const MongoEvalItem = getMongoModel<EvalItemSchemaType>(
  EvalItemCollectionName,
  EvalItemSchema
);
