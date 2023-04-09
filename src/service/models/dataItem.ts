import type { DataItemSchema as DataItemType } from '@/types/mongoSchema';
import { Schema, model, models, Model } from 'mongoose';
import { DataTypeTextMap } from '@/constants/data';

const DataItemSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  dataId: {
    type: Schema.Types.ObjectId,
    ref: 'data',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: Object.keys(DataTypeTextMap)
  },
  times: {
    // 剩余重试次数
    type: Number,
    default: 3
  },
  text: {
    // 文本内容
    type: String,
    required: true
  },
  rawResponse: {
    // 原始拆分结果
    type: [String],
    default: []
  },
  result: {
    type: [
      {
        q: {
          type: String,
          default: ''
        },
        a: {
          type: String,
          default: ''
        },
        abstract: {
          // 摘要
          type: String,
          default: ''
        },
        abstractVector: {
          // 摘要对应的向量
          type: [Number],
          default: []
        }
      }
    ],
    default: []
  },
  status: {
    // 0-闲置，1-待生成，2-生成中
    type: Number,
    default: 1
  }
});

export const DataItem: Model<DataItemType> =
  models['dataItem'] || model('dataItem', DataItemSchema);
