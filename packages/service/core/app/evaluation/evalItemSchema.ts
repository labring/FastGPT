import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { EvaluationCollectionName } from './evalSchema';
import type { EvalItemSchemaType } from './type';

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
  globalVariales: Object,
  response: String,

  status: {
    type: Number,
    enum: [0, 1, 2], // 0: unprocessed, 1: processing, 2: completed
    default: 0
  },
  retry: {
    type: Number,
    default: 3
  },
  errorMessage: String,
  accuracy: Number,
  relevance: Number,
  semanticAccuracy: Number,
  score: Number
});

try {
  EvalItemSchema.index({ evalId: 1 });
  EvalItemSchema.index({ evalId: 1, status: 1 });
} catch (error) {
  console.log(error);
}

export const MongoEvalItem = getMongoModel<EvalItemSchemaType>(
  EvalItemCollectionName,
  EvalItemSchema
);
