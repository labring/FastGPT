import { Schema } from 'mongoose';
import { defineMongoCollection } from '../../../mongo/collection';
import { DatasetQaTrainingCollectionName } from '../../../mongo/datasetQaTrainingCollectionName';
import { DatasetQaTrainingStatusSchema } from '../repo.type';

export type DatasetQaTrainingMongoDoc = {
  _id: unknown;
  teamId: unknown;
  tmbId: unknown;
  datasetId: unknown;
  collectionId: unknown;
  q?: string;
  chunkIndex?: number;
  dataMetadata?: Record<string, any>;
  status: 'active' | 'error';
  errorMsg?: string;
  createTime?: Date;
  updateTime?: Date;
};

const DatasetQaTrainingMongoSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, required: true },
    tmbId: { type: Schema.Types.ObjectId, required: true },
    datasetId: { type: Schema.Types.ObjectId, required: true },
    collectionId: { type: Schema.Types.ObjectId, required: true },
    q: { type: String, default: '' },
    chunkIndex: { type: Number, default: 0 },
    dataMetadata: Object,
    status: {
      type: String,
      enum: DatasetQaTrainingStatusSchema.options,
      required: true,
      default: 'active'
    },
    errorMsg: String
  },
  { timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' } }
);

/** DatasetQaTraining MongoDB 纯声明式集合定义（零导入副作用，由 MongoRepositoryBase 构造期自动绑定 Model）。 */
export const datasetQaTrainingMongoCollection = defineMongoCollection<DatasetQaTrainingMongoDoc>({
  name: DatasetQaTrainingCollectionName,
  datasource: 'main',
  schema: DatasetQaTrainingMongoSchema,
  indexes: [
    {
      key: { teamId: 1, datasetId: 1, collectionId: 1, status: 1, chunkIndex: 1, _id: 1 },
      options: { name: 'fg_dataset_qa_training_scope_stage_order' }
    }
  ]
});
