import { connectionMongo, defineIndex, getMongoModel } from '../../../common/mongo';
import { AIModelCollectionName } from './constants';
const { Schema } = connectionMongo;
import type { AIModelSchemaType } from '../type';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';

const AIModelSchema = new Schema(
  {
    model: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    provider: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    scope: {
      type: String,
      enum: Object.values(ModelScopeEnum),
      required: true,
      default: ModelScopeEnum.system
    },
    tmbId: {
      type: Schema.Types.ObjectId,
      ref: 'team_members'
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'teams'
    },
    isActive: Boolean,
    requestUrl: String,
    requestAuth: String,
    testMode: Boolean,
    pricing: {
      type: new Schema(
        {
          tiers: {
            type: [{ _id: false, maxInputTokens: Number, inputPrice: Number, outputPrice: Number }],
            default: undefined
          },
          unitPrice: Number
        },
        { _id: false, minimize: false }
      ),
      default: undefined
    },
    /** @deprecated 根级综合价仅保留给旧节点与迁移读取。 */
    charsPointsPrice: Number,
    /** @deprecated 根级阶梯价仅保留给旧节点与迁移读取。 */
    priceTiers: [
      {
        _id: false,
        minInputTokens: Number,
        maxInputTokens: Number,
        inputPrice: Number,
        outputPrice: Number
      }
    ],
    /** @deprecated 根级输入价仅保留给旧节点与迁移读取。 */
    inputPrice: Number,
    /** @deprecated 根级输出价仅保留给旧节点与迁移读取。 */
    outputPrice: Number,
    config: {
      type: Schema.Types.Mixed,
      required: true,
      default: {}
    }
  },
  {
    minimize: false
  }
);

defineIndex(AIModelSchema, {
  key: { scope: 1, model: 1 },
  options: {
    unique: true,
    partialFilterExpression: { scope: ModelScopeEnum.system }
  }
});

defineIndex(AIModelSchema, {
  key: { scope: 1, tmbId: 1, model: 1 },
  options: {
    unique: true,
    partialFilterExpression: { scope: ModelScopeEnum.team }
  }
});

defineIndex(AIModelSchema, {
  key: { scope: 1, teamId: 1, model: 1 },
  options: {
    partialFilterExpression: { scope: ModelScopeEnum.team }
  }
});

export const MongoAIModel = getMongoModel<AIModelSchemaType>(AIModelCollectionName, AIModelSchema);
